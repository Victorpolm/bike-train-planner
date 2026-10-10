import { arrivalTime, departureTime } from "./realtime.ts";
import type { CyclingComparison, Journey, Place, TransitLeg } from "./routing.ts";
import { interpretBicycleAttributes, type BicycleAttribute } from "./bicycleCarriage.ts";

export type TransportStop = {
  station?: { id?: string | null; name?: string | null; coordinate?: { x: number | null; y: number | null } } | null;
  departure?: string | null;
  departureTimestamp?: number | null;
  arrival?: string | null;
  arrivalTimestamp?: number | null;
  platform?: string | number | null;
};

export type TransportSection = {
  journey?: {
    category?: string | null;
    operator?: string | number | null;
    number?: string | number | null;
    name?: string | null;
    to?: string | null;
    passList?: TransportStop[];
    bicycleData?: { attributes: BicycleAttribute[]; source: { title: string; url: string; checked: string } };
  } | null;
  walk?: unknown;
  departure?: TransportStop | null;
  arrival?: TransportStop | null;
};

export function stopTime(stop: TransportStop | null | undefined, event: "arrival" | "departure") {
  const timestamp = stop?.[`${event}Timestamp`];
  const raw = stop?.[event];
  const date = typeof timestamp === "number" && Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : raw ? new Date(raw) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}

function platform(value: TransportStop["platform"]): string | null {
  return value === null || value === undefined ? null : String(value).trim() || null;
}

// Preserve order and repeated services: two trains with the same line label
// are still two separate legs. Missing details remain explicit unknowns.
export function transitLegsFromSections(sections?: TransportSection[] | null): TransitLeg[] {
  return (sections ?? []).map((section) => {
    const service = section.journey;
    const mode = service ? "transit" : section.walk != null ? "walk" : "unknown";
    const leg: TransitLeg = {
      mode,
      from: section.departure?.station?.name || null,
      to: section.arrival?.station?.name || null,
      departure: stopTime(section.departure, "departure"),
      arrival: stopTime(section.arrival, "arrival"),
      departurePlatform: platform(section.departure?.platform),
      arrivalPlatform: platform(section.arrival?.platform),
      service: service
        ? [service.category, service.number].filter((value) => value != null && value !== "").join(" ")
          || service.name || "Transit service"
        : mode === "walk" ? "Transfer on foot" : "Transfer details unavailable",
      serviceName: service?.name || null,
      category: service?.category?.trim() || null,
      operator: service?.operator == null ? null : String(service.operator).trim() || null,
      direction: service?.to || null,
      fromId: section.departure?.station?.id ?? undefined,
      toId: section.arrival?.station?.id ?? undefined,
    };
    if (service?.bicycleData && leg.fromId && leg.toId && leg.departure) {
      const { attributes, source } = service.bicycleData;
      const rule = interpretBicycleAttributes(attributes);
      leg.bicycleAttributes = attributes;
      leg.bicycleEvidence = { permission: rule.permission, fromId: leg.fromId, toId: leg.toId,
        departure: leg.departure.toISOString(), service: leg.service, operator: leg.operator ?? null,
        source, basis: rule.basis, conditions: rule.notes,
        prerequisites: { bikeTicket: "unknown", bikeReservation: rule.bikeReservation } };
    }
    return leg;
  });
}

export type JourneyStep = {
  mode: "bike" | "wait" | TransitLeg["mode"];
  title: string;
  from: string | null;
  to: string | null;
  departure: Date | null;
  arrival: Date | null;
  leg?: TransitLeg;
  cyclingRoute?: TransitLeg["cyclingRoute"];
};

/** Cycling-only plans share the same explicit visit steps as mixed journeys. */
export function cyclingSteps(cycling: CyclingComparison, origin: Place, destination: Place, start: Date): JourneyStep[] {
  let cursor = +(cycling.departure ?? start);
  const steps: JourneyStep[] = [];
  const routes = cycling.routes ?? [];
  routes.forEach((route, i) => {
    const before = (cycling.stops ?? []).find(s => s.afterRoute === i - 1)?.visit;
    const after = (cycling.stops ?? []).find(s => s.afterRoute === i)?.visit;
    const departure = new Date(cursor); cursor += route.minutes * 60_000;
    steps.push({ mode: "bike", title: "Cycle", from: before?.name ?? (i === 0 ? origin.label : "Cycling section"),
      to: after?.name ?? (i === routes.length - 1 ? destination.label : "Cycling section"), departure, arrival: new Date(cursor), cyclingRoute: route });
    for (const s of (cycling.stops ?? []).filter(s => s.afterRoute === i)) {
      const departure = new Date(cursor); cursor += s.visit.minutes * 60_000;
      const leg: TransitLeg = { mode: "stop", facilityVisit: s.visit, from: s.visit.name, to: s.visit.name, fromPoint: s.visit, toPoint: s.visit,
        departure, arrival: new Date(cursor), departurePlatform: null, arrivalPlatform: null, service: `Stop at ${s.visit.name}`, serviceName: null, direction: null };
      steps.push({ mode: "stop", title: leg.service, from: leg.from, to: leg.to, departure, arrival: leg.arrival, leg });
    }
  });
  return steps;
}

export function journeySteps(journey: Journey, origin: Place, destination: Place): JourneyStep[] {
  if (journey.legsIncludeEndpoints) {
    const steps: JourneyStep[] = [];
    let previous = journey.startTime;
    for (const leg of journey.transitLegs) {
      if (departureTime(leg) && departureTime(leg)! > previous) steps.push({ mode: "wait", title: "Boarding and waiting time",
        from: leg.from, to: leg.from, departure: previous, arrival: departureTime(leg) });
      // Zero-length waypoint visits still make the required visit visible.
      if (leg.mode !== "bike" || arrivalTime(leg)!.getTime() > departureTime(leg)!.getTime() || leg.service.includes("intermediate")) {
        steps.push({ mode: leg.mode, title: leg.service, from: leg.from, to: leg.to,
          departure: departureTime(leg), arrival: arrivalTime(leg), leg, cyclingRoute: leg.cyclingRoute });
      }
      if (arrivalTime(leg)) previous = arrivalTime(leg)!;
    }
    return steps;
  }
  const bikeArrival = new Date(journey.startTime.getTime() + journey.originStation.bikeMinutes * 60_000);
  const steps: JourneyStep[] = [{
    mode: "bike", title: "Bike to the station", from: origin.label,
    to: journey.originStation.name, departure: journey.startTime, arrival: bikeArrival,
    cyclingRoute: journey.originStation.cyclingRoute,
  }];

  const addWait = (departure: Date | null, arrival: Date | null, from: string | null, to: string | null, title: string) => {
    if (departure && arrival && arrival.getTime() > departure.getTime()) {
      steps.push({ mode: "wait", title, from, to, departure, arrival });
    }
  };
  addWait(bikeArrival, journey.departure, journey.originStation.name, journey.originStation.name, "Boarding and waiting time");

  if (!journey.transitLegs.length) {
    steps.push({
      mode: "unknown", title: "Transit connection — leg details unavailable",
      from: journey.originStation.name, to: journey.destinationStation.name,
      departure: journey.departure, arrival: journey.arrival,
    });
  }
  journey.transitLegs.forEach((leg, index) => {
    const previous = journey.transitLegs[index - 1];
    if (previous) addWait(arrivalTime(previous), departureTime(leg), previous.to, leg.from, "Connection time");
    steps.push({
      mode: leg.mode, title: leg.service, from: leg.from, to: leg.to,
      departure: departureTime(leg), arrival: arrivalTime(leg), leg, cyclingRoute: leg.cyclingRoute,
    });
  });

  steps.push({
    mode: "bike", title: "Bike to your destination", from: journey.destinationStation.name,
    to: destination.label, departure: journey.arrival,
    arrival: new Date(journey.arrival.getTime() + journey.destinationStation.bikeMinutes * 60_000),
    cyclingRoute: journey.destinationStation.cyclingRoute,
  });
  return steps;
}
