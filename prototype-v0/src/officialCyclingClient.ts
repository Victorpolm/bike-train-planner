import { applyCyclingEdit, type AppliedCyclingEdit, type EditContext } from "./cyclingEditor.ts";
import type { DetourStage } from "./cyclingDetour.ts";
import type { CyclingRoute } from "./cycling.ts";
import { fetchJson } from "./http.ts";
import { officialBounds, officialGuides, lineMatch, overlapsClosure, type Bounds, type OfficialClosureReply, type OfficialRouteReply, type OfficialSection } from "./officialCycling.ts";
import type { Point } from "./routing.ts";

export async function requestOfficialData<K extends "routes" | "closures">(kind: K, bounds: Bounds, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<K extends "routes" ? OfficialRouteReply : OfficialClosureReply> {
  const data = await fetchJson<any>("/api/official-cycling", signal, 20000, fetcher,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, bounds }) });
  if (!data || !Array.isArray(data[kind]) || typeof data.incomplete !== "boolean" || !Number.isFinite(Date.parse(data.checkedAt))) throw new Error("The official data could not be validated.");
  return data;
}
export type CheckedOfficialOption = { edit: AppliedCyclingEdit; routes: CyclingRoute[]; checkedAt: string; minutes: number; distanceKm: number; section: OfficialSection };
export function applyOfficialOption(context: EditContext, stage: DetourStage, checked: Pick<CheckedOfficialOption, "routes" | "checkedAt">): AppliedCyclingEdit {
  const checkedAt = Date.parse(checked.checkedAt);
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > 30 * 60_000 || checkedAt > Date.now() + 60_000)
    throw new Error("The closure check expired. Check this option again before applying.");
  const edit = applyCyclingEdit(context, stage, checked.routes);
  if (edit.cycling && edit.cycling.routes!.reduce((sum, r) => sum + r.minutes, 0) > context.options.maxBikeMinutes)
    throw new Error(`This option exceeds your ${context.options.maxBikeMinutes}-minute cycling limit.`);
  return edit;
}
export async function checkOfficialOption(context: EditContext, stage: DetourStage, section: OfficialSection,
  client: { route(a: Point, b: Point): Promise<CyclingRoute | null>; guidedRoute(points: readonly Point[]): Promise<CyclingRoute> },
  signal: AbortSignal, closureCheck: (bounds: Bounds) => Promise<OfficialClosureReply>): Promise<CheckedOfficialOption> {
  signal.throwIfAborted();
  const official = await client.guidedRoute(officialGuides(section.points));
  signal.throwIfAborted();
  const matched = Math.min(lineMatch(official.points, section.points), lineMatch(section.points, official.points));
  if (official.blocked || matched < .95 || official.startGapM > 60 || official.endGapM > 60 || official.distanceKm > section.distanceKm * 1.2 + .2)
    throw new Error("The routable path diverges from this official section. It has not been offered as an official-route option.");
  const first = await client.route(stage.from, official.from); signal.throwIfAborted();
  const last = await client.route(official.to, stage.to); signal.throwIfAborted();
  if (!first || !last || first.blocked || last.blocked) throw new Error("A usable connection to this official route could not be checked.");
  const routes = [first, official, last];
  const closure = await closureCheck(officialBounds(routes.flatMap(r => [r.from, ...r.points, r.to])));
  signal.throwIfAborted();
  if (closure.incomplete || Date.now() - Date.parse(closure.checkedAt) > 30 * 60_000 || Date.parse(closure.checkedAt) > Date.now() + 60_000)
    throw new Error("The closure check is incomplete or expired. Retry before applying this route.");
  const blocked = overlapsClosure(routes.map(r => [r.from, ...r.points, r.to]), closure.closures);
  if (blocked) throw new Error("A published closure intersects this path" + (blocked.duration ? ` (${blocked.duration})` : "") + ". Check SwitzerlandMobility for an alternative.");
  official.officialRoute = { number: section.route.number, title: section.route.title, url: section.route.url, sectionKm: section.distanceKm,
    matchedPercent: Math.round(matched * 100), checkedAt: new Date().toISOString(), closuresCheckedAt: closure.checkedAt };
  const edit = applyOfficialOption(context, stage, { routes, checkedAt: closure.checkedAt });
  return { edit, routes, checkedAt: closure.checkedAt, minutes: routes.reduce((sum, r) => sum + r.minutes, 0),
    distanceKm: routes.reduce((sum, r) => sum + r.distanceKm, 0), section };
}
