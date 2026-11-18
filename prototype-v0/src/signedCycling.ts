import type { CyclingRoute } from "./cycling.ts";

const cyclingNetworks = ["route_bicycle_icn", "route_bicycle_ncn", "route_bicycle_rcn", "route_bicycle_lcn"];

// BRouter exposes active network membership but usually no route number.
// A change of network, a gap in the evidence or a dismount interrupts a run.
export function signedCyclingStretch(route: CyclingRoute) {
  const runs = cyclingNetworks.map(() => 0);
  let longestM = 0, endM = 0;
  for (const section of route.sections) {
    if (Math.abs(section.startM - endM) > .01) runs.fill(0);
    const metres = Math.max(0, section.endM - section.startM);
    for (let i = 0; i < cyclingNetworks.length; i++) {
      const active = section.mode === "cycle" && section.tags[cyclingNetworks[i]] === "yes";
      runs[i] = active ? runs[i] + metres : 0;
      longestM = Math.max(longestM, runs[i]);
    }
    endM = section.endM;
  }
  return { longestM, outsideM: Math.max(0, route.distanceKm * 1000 - longestM) };
}
