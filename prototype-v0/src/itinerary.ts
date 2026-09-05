import type { Journey, Place, TransitLeg } from "./routing";

type TransportStop = {
  station?: { name?: string | null } | null;
  departure?: string | null;
  departureTimestamp?: number | null;
  arrival?: string | null;
  arrivalTimestamp?: number | null;
  platform?: string | number | null;
};

export type TransportSection = {
  journey?: {
    category?: string | null;
    number?: string | number | null;
    name?: string | null;
    to?: string | null;
  } | null;
  walk?: unknown;
  departure?: TransportStop | null;
  arrival?: TransportStop | null;
};

function stopTime(stop: TransportStop | null | undefined, event: "arrival" | "departure") {
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
    return {
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
      direction: service?.to || null,
    };
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
};

export function journeySteps(journey: Journey, origin: Place, destination: Place): JourneyStep[] {
  const bikeArrival = new Date(journey.startTime.getTime() + journey.originStation.bikeMinutes * 60_000);
  const steps: JourneyStep[] = [{
    mode: "bike", title: "Bike to the station", from: origin.label,
    to: journey.originStation.name, departure: journey.startTime, arrival: bikeArrival,
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
    if (previous) addWait(previous.arrival, leg.departure, previous.to, leg.from, "Connection time");
    steps.push({
      mode: leg.mode, title: leg.service, from: leg.from, to: leg.to,
      departure: leg.departure, arrival: leg.arrival, leg,
    });
  });

  steps.push({
    mode: "bike", title: "Bike to your destination", from: journey.destinationStation.name,
    to: destination.label, departure: journey.arrival,
    arrival: new Date(journey.arrival.getTime() + journey.destinationStation.bikeMinutes * 60_000),
  });
  return steps;
}
