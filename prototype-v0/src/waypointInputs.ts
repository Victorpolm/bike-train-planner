import type { PlaceValue } from "./PlaceInput.tsx";
import { bicycleStopAction } from "./bicycleAvailability.ts";
import type { Options } from "./model.ts";
import type { Place } from "./routing.ts";

/** The action belongs to the stop, so changing its text or map point keeps it. */
export type WaypointInput = {
  id: string;
  value: PlaceValue;
  bicycleAction?: "park" | "collect";
};

function placeWithoutBicycleAction(place: Place): Place {
  const { bicycleAction: _action, ...location } = place;
  return location;
}

/** Restore the form without changing the saved itinerary. */
export function restoreWaypointInputs(
  points: readonly Place[],
  _options: Options,
  nextId: () => string,
): WaypointInput[] {
  const stops = [...points];
  return stops.map(point => ({
    id: nextId(),
    value: { text: point.label, place: placeWithoutBicycleAction(point) },
    bicycleAction: bicycleStopAction(point),
  }));
}

/** Keep the user's selected action authoritative after autocomplete or dragging. */
export function waypointPlace(input: WaypointInput, place: Place): Place {
  return { ...placeWithoutBicycleAction(place), ...(input.bicycleAction ? { bicycleAction: input.bicycleAction } : {}) };
}

export async function resolveWaypointInputs(
  inputs: readonly WaypointInput[],
  resolve: (text: string) => Promise<Place>,
): Promise<(string | Place)[]> {
  return Promise.all(inputs.map(async input => {
    if (input.value.place) return waypointPlace(input, input.value.place);
    const text = input.value.text.trim();
    if (!input.bicycleAction) return text;
    if (!text) throw new Error("Choose a location for each bicycle pickup or leave stop.");
    return waypointPlace(input, await resolve(text));
  }));
}

/** Form-level sequence check also works before a typed location is resolved.
 * The routing layer separately validates each actual action location. */
export function bicycleAtDestination(inputs: readonly WaypointInput[], bicycleAtOrigin: boolean) {
  let withBicycle = bicycleAtOrigin;
  for (const [index, input] of inputs.entries()) {
    if (input.bicycleAction === "collect" && withBicycle)
      throw new Error(`You already have a bike before intermediate stop ${index + 1}. Choose Leave a bike at an earlier stop, or start without a bike.`);
    if (input.bicycleAction === "park" && !withBicycle)
      throw new Error(`You have no bike to leave at intermediate stop ${index + 1}. Choose Pick up a bike at an earlier stop, or start with a bike.`);
    if (input.bicycleAction) withBicycle = input.bicycleAction === "collect";
  }
  return withBicycle;
}

/** A return journey starts with the outward journey's final status. Every
 * pickup becomes a leave at the same location, and every leave a pickup. */
export function reverseWaypointInputs(inputs: readonly WaypointInput[], bicycleAtOrigin: boolean) {
  return {
    bicycleAtOrigin: bicycleAtDestination(inputs, bicycleAtOrigin),
    vias: [...inputs].reverse().map(input => ({ ...input,
      bicycleAction: input.bicycleAction === "park" ? "collect" as const
        : input.bicycleAction === "collect" ? "park" as const : undefined,
    })),
  };
}
