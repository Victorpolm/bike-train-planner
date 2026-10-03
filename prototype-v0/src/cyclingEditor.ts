import { detourStages, type DetourStage } from "./cyclingDetour.ts";
import type { CyclingRoute } from "./cycling.ts";
import { journeySteps } from "./itinerary.ts";
import { metrics, validateOptions, type Options } from "./model.ts";
import { haversineKm, type CyclingComparison, type Journey, type Place, type TransitLeg } from "./routing.ts";

export const MAX_SHAPING_POINTS = 6;
export type EditContext = { journey: Journey | null; cycling: CyclingComparison | null; origin: Place; destination: Place; start: Date; options: Options };
export type AppliedCyclingEdit = { journey: Journey | null; cycling: CyclingComparison | null };

export async function requestEditedCycling(stage: DetourStage, via: readonly Place[],
  client: { route: (a: Place, b: Place) => Promise<CyclingRoute | null> }, signal: AbortSignal): Promise<CyclingRoute[]> {
  if (via.length > MAX_SHAPING_POINTS || via.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lon)
    || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) throw new Error("Choose up to six valid route points.");
  const points = [stage.from, ...via, stage.to], routes: CyclingRoute[] = [];
  for (let i = 1; i < points.length; i++) {
    signal.throwIfAborted();
    const route = await client.route(points[i - 1], points[i]);
    signal.throwIfAborted();
    if (!route || route.blocked) throw new Error(`No usable cycling path was returned for part ${i}. Move or remove that point.`);
    routes.push(route);
  }
  return routes;
}

/** Rebuild only active travel times; public-transport legs retain their exact objects and fare evidence. */
export function applyCyclingEdit(context: EditContext, stage: DetourStage, routes: readonly CyclingRoute[]): AppliedCyclingEdit {
  validateOptions(context.options);
  const { journey, cycling, origin, destination, start, options } = context;
  const current = detourStages(journey, cycling, origin, destination, start).find(s => s.id === stage.id && s.route === stage.route);
  if (!current) throw new Error("The selected journey changed. Reopen the cycling editor.");
  if (!routes.length || routes.length > MAX_SHAPING_POINTS + 1 || routes.some(r => r.blocked || !Number.isFinite(r.minutes) || r.minutes < 0))
    throw new Error("A complete usable cycling path is required.");
  const equal = (a: Place | CyclingRoute["from"], b: Place | CyclingRoute["from"]) => haversineKm(a, b) < .001;
  if (!equal(routes[0].from, stage.from) || !equal(routes.at(-1)!.to, stage.to)
    || routes.slice(1).some((r, i) => !equal(routes[i].to, r.from))) throw new Error("The edited path must keep this section’s endpoints and remain connected.");

  if (!journey) {
    if (!cycling?.routes) throw new Error("No cycling route is selected.");
    const index = detourStages(null, cycling, origin, destination, start).findIndex(s => s.id === stage.id);
    const updated = [...cycling.routes.slice(0, index), ...routes, ...cycling.routes.slice(index + 1)];
    const minutes = updated.reduce((sum, route) => sum + route.minutes, 0);
    if (minutes > options.horizonMinutes) throw new Error("This edited ride exceeds the journey time window.");
    return { journey: null, cycling: { routes: updated, minutes, distanceKm: updated.reduce((sum, r) => sum + r.distanceKm, 0),
      arrival: new Date(+start + minutes * 60_000) } };
  }

  const steps = journeySteps(journey, origin, destination);
  const target = Number(stage.id.slice(0, stage.id.indexOf(":")));
  const firstTransit = steps.findIndex(s => s.mode === "transit");
  const lastTransit = steps.reduce((found, s, i) => s.mode === "transit" ? i : found, -1);
  if (firstTransit < 0) throw new Error("No public-transport service is present; edit the cycling-only route instead.");
  if (routes.some(r => r.minutes > 0) && (options.cyclingPosition === "start-only" && target > firstTransit
    || options.cyclingPosition === "end-only" && target < lastTransit))
    throw new Error("This edit conflicts with where you chose to cycle. Change Preferences and search again.");
  const original = steps[target];
  const cap = original.leg?.cyclingSectionLimit ?? (target < firstTransit ? options.maxAccessMinutes : target > lastTransit ? options.maxEgressMinutes
    : original.title.includes("intermediate stop") || original.title.includes("destination") ? options.maxEgressMinutes
      : original.title.includes("station") ? options.maxAccessMinutes : options.maxIntermediateMinutes);
  const group = original.leg?.cyclingSectionId ?? stage.id;
  const groupMinutes = journey.transitLegs.filter(l => l.mode === "bike" && l.cyclingSectionId === group)
    .reduce((sum, l) => sum + (l.departure && l.arrival ? (+l.arrival - +l.departure) / 60_000 : Infinity), 0);
  if ((groupMinutes || stage.originalMinutes) - stage.originalMinutes + routes.reduce((sum, r) => sum + r.minutes, 0) > cap)
    throw new Error(`This cycling section exceeds its ${cap}-minute limit. Move or remove a point, or change Preferences and search again.`);

  const legs: TransitLeg[] = [];
  const arrivalByStep = new Map<number, Date>();
  let cursor = +start;
  const plainLeg = (index: number): TransitLeg => {
    const step = steps[index];
    if (step.leg) return step.leg;
    return { mode: step.mode === "wait" ? "walk" : step.mode, from: step.from, to: step.to, departure: step.departure,
      arrival: step.arrival, service: step.title, serviceName: null, direction: null, departurePlatform: null, arrivalPlatform: null,
      cyclingRoute: step.cyclingRoute, geometry: step.cyclingRoute?.points, fromPoint: step.cyclingRoute?.from, toPoint: step.cyclingRoute?.to };
  };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.mode === "wait") continue;
    if (!step.departure || !step.arrival || step.mode === "unknown") throw new Error("Some onward times are unknown; this edit cannot be applied.");
    if (i === target) {
      cursor = +step.departure;
      routes.forEach((route, part) => {
        const previous = plainLeg(i), departure = new Date(cursor);
        cursor += route.minutes * 60_000;
        legs.push({ ...previous, from: part === 0 ? step.from : `Route point ${part}`, to: part === routes.length - 1 ? step.to : `Route point ${part + 1}`,
          fromId: part === 0 ? previous.fromId : undefined, toId: part === routes.length - 1 ? previous.toId : undefined,
          fromPoint: route.from, toPoint: route.to, departure, arrival: new Date(cursor), cyclingRoute: route, geometry: route.points,
          cyclingSectionId: group, cyclingSectionLimit: cap });
      });
    } else if (i < target || step.mode === "transit") {
      if (i > target && cursor + options.boardingMinutes * 60_000 > +step.departure)
        throw new Error(`This edit would miss ${step.title}. Shorten the ride or search for different services.`);
      legs.push(plainLeg(i)); cursor = +step.arrival;
    } else {
      const duration = +step.arrival - +step.departure;
      if (duration < 0) throw new Error("Some onward times are invalid.");
      legs.push({ ...plainLeg(i), departure: new Date(cursor), arrival: new Date(cursor + duration) });
      cursor += duration;
    }
    arrivalByStep.set(i, new Date(cursor));
  }
  const rides = legs.filter(l => l.mode === "transit");
  let previousVisitStep = 0;
  const result: Journey = { ...journey, legsIncludeEndpoints: true, transitLegs: legs,
    originStation: { ...journey.originStation, bikeMinutes: 0, distanceKm: 0, cyclingRoute: undefined },
    destinationStation: { ...journey.destinationStation, bikeMinutes: 0, distanceKm: 0, cyclingRoute: undefined },
    departure: legs[0].departure!, arrival: new Date(cursor), totalMinutes: (cursor - +start) / 60_000,
    trainMinutes: (+rides.at(-1)!.arrival! - +rides[0].departure!) / 60_000,
    waitMinutes: legs.reduce((sum, l, i) => sum + Math.max(0, (+l.departure! - +(legs[i - 1]?.arrival ?? start)) / 60_000), 0),
    waypoints: journey.waypoints?.map(visit => {
      const index = steps.findIndex((step, i) => i >= previousVisitStep && step.arrival && +step.arrival === +visit.arrival
        && (step.leg?.toPoint || step.cyclingRoute?.to) && equal((step.leg?.toPoint ?? step.cyclingRoute!.to), visit.place));
      const arrival = arrivalByStep.get(index);
      if (!arrival) throw new Error("An intermediate stop could not be preserved.");
      previousVisitStep = index;
      return { ...visit, arrival };
    }) };
  if (metrics(result).bike > options.maxBikeMinutes) throw new Error(`This edit exceeds your ${options.maxBikeMinutes}-minute total cycling limit.`);
  if (result.totalMinutes > options.horizonMinutes) throw new Error("This edit exceeds the journey time window.");
  return { journey: result, cycling: null };
}
