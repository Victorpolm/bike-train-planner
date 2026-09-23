import { categorize, metrics, type Options, type Proposal } from "./model.ts";
import { formatMinutes, type CyclingComparison, type Journey } from "./routing.ts";
import type { BicycleScope } from "./bicyclePermission.ts";

export const scopeLabels: Record<BicycleScope, string> = {
  confirmed: "Confirmed permission only", "allow-uncertain": "Allow uncertain permission",
  "all-transit": "All public transport · comparison only",
};
export type ScopedProposal = Proposal & { wins: { scope: BicycleScope; categories: string[]; extraMinutes: number }[] };
export function recommend(confirmed: Journey[], possible: Journey[], allTransit: Journey[], options: Options) {
  // Optimize first, then merge: filtering the permissive winners would lose
  // slower confirmed journeys that were pruned by an uncertain alternative.
  const groups = ([{ scope: "confirmed", journeys: confirmed }, { scope: "allow-uncertain", journeys: possible },
    { scope: "all-transit", journeys: allTransit }] as const)
    .map(({ scope, journeys }) => ({ scope, proposals: categorize(journeys, options) }));
  const merged = new Map<string, ScopedProposal>();
  for (const { scope, proposals } of groups) for (const proposal of proposals) {
    const win = { scope, categories: proposal.categories, extraMinutes: proposal.extraMinutes };
    const previous = merged.get(proposal.journey.id);
    if (previous) previous.wins.push(win);
    else merged.set(proposal.journey.id, { ...proposal, wins: [win] });
  }
  const signature = (proposals: Proposal[]) => JSON.stringify(proposals.map(p => [p.journey.id, [...p.categories].sort()]).sort());
  return { groups, proposals: [...merged.values()], identical: groups.every(g => signature(g.proposals) === signature(groups[0].proposals)) };
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
