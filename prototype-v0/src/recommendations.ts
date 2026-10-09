import { categorize, metrics, type Options, type Proposal } from "./model.ts";
import { formatMinutes, type CyclingComparison, type Journey } from "./routing.ts";
import type { BicycleScope } from "./bicyclePermission.ts";
import { objectiveLabels, requestedObjectives, type ObjectiveFareContext } from "./journeyObjectives.ts";
import { hillSearch } from "./hills.ts";

/** Use all displayed batches, even when no other objective can produce a card. */
export function climbingNotice(options: Options, proposals: Pick<Proposal, "categories">[]): string | null {
  if (!hillSearch(options) || proposals.some(p => p.categories.includes("Gentlest cycling") || p.categories.includes("Reduce climbing"))) return null;
  return options.hills?.mode === "gentler"
    ? "Gentlest cycling is unavailable: no eligible journey has complete elevation within the time allowance."
    : "No worthwhile climbing reduction was verified within the time allowance. Routes with incomplete elevation cannot qualify.";
}

export const scopeLabels: Record<BicycleScope, string> = {
  confirmed: "Confirmed permission only", "allow-uncertain": "Allow uncertain permission",
  "all-transit": "All public transport · comparison only",
};
export type ScopedProposal = Proposal & { wins: { scope: BicycleScope; categories: string[]; extraMinutes: number; climbingSaved?: number; explanations?: string[] }[] };
export function recommend(confirmed: Journey[], possible: Journey[], allTransit: Journey[], options: Options, fares?: ObjectiveFareContext) {
  // Optimize first, then merge: filtering the permissive winners would lose
  // slower confirmed journeys that were pruned by an uncertain alternative.
  const groups = ([{ scope: "confirmed", journeys: confirmed }, { scope: "allow-uncertain", journeys: possible },
    { scope: "all-transit", journeys: allTransit }] as const)
    .filter(group => !options.bicycleScope || group.scope === options.bicycleScope)
    .map(({ scope, journeys }) => ({ scope, proposals: categorize(journeys, options, fares) }));
  const merged = new Map<string, ScopedProposal>();
  for (const { scope, proposals } of groups) for (const proposal of proposals) {
    const win = { scope, categories: proposal.categories, extraMinutes: proposal.extraMinutes, climbingSaved: proposal.climbingSaved, explanations: proposal.explanations };
    const previous = merged.get(proposal.journey.id);
    if (previous) previous.wins.push(win);
    else merged.set(proposal.journey.id, { ...proposal, wins: [win] });
  }
  const signature = (proposals: Proposal[]) => JSON.stringify(proposals.map(p => [p.journey.id, [...p.categories].sort()]).sort());
  const categories = new Set([...merged.values()].flatMap(p => p.categories));
  const unavailable = requestedObjectives(options).filter(o => ["less-traffic", "fewer-reservations", "cheapest"].includes(o) && !categories.has(objectiveLabels[o]));
  return { groups, proposals: [...merged.values()], unavailable, identical: groups.every(g => signature(g.proposals) === signature(groups[0].proposals)) };
}
export function compareCycling(journey: Journey, cycling: CyclingComparison): string {
  const time = journey.totalMinutes - cycling.minutes, active = metrics(journey).active - cycling.minutes;
  const duration = time === 0 ? "Same estimated travel time" : `${formatMinutes(Math.abs(time))} ${time > 0 ? "longer" : "quicker"}`;
  const effort = active === 0 ? "same cycling or walking time" : `${formatMinutes(Math.abs(active))} ${active > 0 ? "more" : "less"} cycling or walking`;
  return `${duration} · ${effort} than cycling only.`;
}
export function waitingMinutes(journey: Journey) {
  const riding = journey.transitLegs.filter(l => l.mode === "transit").reduce((sum, l) => sum
    + (l.departure && l.arrival ? (l.arrival.getTime() - l.departure.getTime()) / 60_000 : 0), 0);
  return Math.max(0, journey.totalMinutes - metrics(journey).active - riding);
}
