import { applyCyclingEdit, type AppliedCyclingEdit, type EditContext } from "./cyclingEditor.ts";
import type { DetourFacility, DetourRoutes, DetourStage } from "./cyclingDetour.ts";
import { cyclingSteps, journeySteps } from "./itinerary.ts";
import type { FacilityVisit } from "./routing.ts";

const MAX_FACILITY_STOPS = 5;
export function applyFacilityStop(context: EditContext, stage: DetourStage, routes: DetourRoutes, facility: DetourFacility, minutes: number): AppliedCyclingEdit {
  if (facility.unavailable) throw new Error(facility.unavailable);
  const count = context.journey?.transitLegs.filter(l => l.facilityVisit).length ?? context.cycling?.stops?.length ?? 0;
  if (count >= MAX_FACILITY_STOPS) throw new Error("This journey already has five facility stops. Restore the original journey to start again.");
  const visit: FacilityVisit = { id: facility.id, name: facility.name, lat: facility.lat, lon: facility.lon,
    category: facility.category, minutes, url: facility.url, note: facility.note, openingHours: facility.openingHours, seasonal: facility.seasonal };
  // The editor checks every visit, including visits moved by a later shape edit.
  return applyCyclingEdit(context, stage, routes, visit);
}
export function facilityStopSteps(edit: AppliedCyclingEdit, context: Pick<EditContext, "origin" | "destination" | "start">) {
  return (edit.journey ? journeySteps(edit.journey, context.origin, context.destination)
    : edit.cycling ? cyclingSteps(edit.cycling, context.origin, context.destination, context.start) : []).filter(s => !!s.leg?.facilityVisit);
}
