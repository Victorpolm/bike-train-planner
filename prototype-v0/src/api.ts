import {
  MAX_BIKE_DISTANCE_KM,
  STATION_BUFFER_MINUTES,
  cyclingMinutes,
  haversineKm,
  parseDurationMinutes,
  type Journey,
  type Place,
  type Point,
  type Station,
} from "./routing";
import { MAJOR_STATIONS } from "./majorStations";
import { transitLegsFromSections, type TransportSection } from "./itinerary";

const GEO_ADMIN_URL =
  "https://api3.geo.admin.ch/rest/services/ech/SearchServer";
const TRANSPORT_URL = "https://transport.opendata.ch/v1";
const MAX_STATIONS_PER_SIDE = 5;
const TRANSPORT_REQUEST_GAP_MS = 380;

let lastTransportRequest = 0;

type GeoAdminResult = {
  attrs?: {
    label?: string;
    detail?: string;
    lat?: number;
    lon?: number;
  };
};

type TransportLocation = {
  id: string | null;
  name: string;
  icon: string | null;
  coordinate?: {
    x: number | null;
    y: number | null;
  };
};

type TransportConnection = {
  duration: string;
  products?: string[];
  from: {
    departure: string;
    departureTimestamp?: number;
  };
  to: {
    arrival: string;
    arrivalTimestamp?: number;
  };
  sections?: TransportSection[];
};

function stripHtml(value: string): string {
  const document = new DOMParser().parseFromString(value, "text/html");
  return document.body.textContent?.replace(/\s+/g, " ").trim() || value;
}

function looksLikeRailStation(location: TransportLocation): boolean {
  if (!location.id || !location.coordinate?.x || !location.coordinate?.y) {
    return false;
  }
  if (location.icon === "train") return true;
  return location.icon === null && !location.name.includes(",");
}

function swissDateParts(date: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("The timetable service is busy. Wait a moment and try again.");
    }
    throw new Error(`Data request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

async function transportJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const elapsed = Date.now() - lastTransportRequest;
  if (elapsed < TRANSPORT_REQUEST_GAP_MS) {
    await new Promise((resolve) =>
      window.setTimeout(resolve, TRANSPORT_REQUEST_GAP_MS - elapsed),
    );
  }
  lastTransportRequest = Date.now();
  const url = new URL(`${TRANSPORT_URL}/${path}`);
  url.search = params.toString();
  return fetchJson<T>(url);
}

export async function geocode(searchText: string): Promise<Place> {
  const url = new URL(GEO_ADMIN_URL);
  url.search = new URLSearchParams({
    searchText,
    type: "locations",
    origins: "address,gazetteer,zipcode,gg25",
    limit: "8",
    sr: "4326",
  }).toString();

  const data = await fetchJson<{ results?: GeoAdminResult[] }>(url);
  const result = data.results?.find(
    (item) => Number.isFinite(item.attrs?.lat) && Number.isFinite(item.attrs?.lon),
  );
  if (!result?.attrs || result.attrs.lat === undefined || result.attrs.lon === undefined) {
    throw new Error(`No Swiss location found for “${searchText}”.`);
  }

  return {
    lat: result.attrs.lat,
    lon: result.attrs.lon,
    label: stripHtml(result.attrs.label || result.attrs.detail || searchText),
  };
}

export async function findCandidateStations(point: Point): Promise<Station[]> {
  const candidates = new Map<string, Station>();

  for (const hub of MAJOR_STATIONS) {
    const distanceKm = haversineKm(point, hub);
    if (distanceKm <= MAX_BIKE_DISTANCE_KM) {
      candidates.set(hub.id, {
        ...hub,
        distanceKm,
        bikeMinutes: cyclingMinutes(distanceKm),
      });
    }
  }

  const samples = candidates.size
    ? [point]
    : [
        point,
        { lat: point.lat + 2.5 / 111.32, lon: point.lon },
        { lat: point.lat - 2.5 / 111.32, lon: point.lon },
        {
          lat: point.lat,
          lon:
            point.lon +
            2.5 / (111.32 * Math.cos((point.lat * Math.PI) / 180)),
        },
        {
          lat: point.lat,
          lon:
            point.lon -
            2.5 / (111.32 * Math.cos((point.lat * Math.PI) / 180)),
        },
      ];

  for (const sample of samples) {
    const data = await transportJson<{ stations?: TransportLocation[] }>(
      "locations",
      new URLSearchParams({ x: String(sample.lat), y: String(sample.lon) }),
    );

    for (const location of data.stations ?? []) {
      if (!looksLikeRailStation(location)) continue;
      const stationPoint = {
        lat: Number(location.coordinate!.x),
        lon: Number(location.coordinate!.y),
      };
      const distanceKm = haversineKm(point, stationPoint);
      if (distanceKm > MAX_BIKE_DISTANCE_KM) continue;

      const station: Station = {
        id: location.id!,
        name: location.name,
        ...stationPoint,
        distanceKm,
        bikeMinutes: cyclingMinutes(distanceKm),
      };
      const existing = candidates.get(station.id);
      if (!existing || station.distanceKm < existing.distanceKm) {
        candidates.set(station.id, station);
      }
    }
  }

  return [...candidates.values()]
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_STATIONS_PER_SIDE);
}

function connectionDates(connection: TransportConnection): {
  departure: Date;
  arrival: Date;
} {
  const departure = connection.from.departureTimestamp
    ? new Date(connection.from.departureTimestamp * 1000)
    : new Date(connection.from.departure);
  const arrival = connection.to.arrivalTimestamp
    ? new Date(connection.to.arrivalTimestamp * 1000)
    : new Date(connection.to.arrival);
  return { departure, arrival };
}

function serviceLabels(connection: TransportConnection): string[] {
  const labels = (connection.sections ?? [])
    .map((section) => section.journey)
    .filter((journey): journey is NonNullable<typeof journey> => Boolean(journey))
    .map((journey) =>
      [journey.category, journey.number].filter(Boolean).join(" ").trim(),
    )
    .filter(Boolean);
  return [...new Set(labels.length ? labels : connection.products ?? [])];
}

async function fetchStationPair(
  origin: Station,
  destination: Station,
  startTime: Date,
): Promise<Journey | null> {
  if (origin.id === destination.id) return null;

  const stationArrival = new Date(
    startTime.getTime() +
      (origin.bikeMinutes + STATION_BUFFER_MINUTES) * 60_000,
  );
  const dateTime = swissDateParts(stationArrival);
  const params = new URLSearchParams({
    from: origin.id,
    to: destination.id,
    date: dateTime.date,
    time: dateTime.time,
    limit: "4",
  });
  params.append("transportations[]", "train");

  const data = await transportJson<{ connections?: TransportConnection[] }>(
    "connections",
    params,
  );
  const connections = data.connections ?? [];
  if (!connections.length) return null;

  const best = connections
    .map((connection) => ({ connection, ...connectionDates(connection) }))
    .sort((a, b) => a.arrival.getTime() - b.arrival.getTime())[0];

  const trainMinutes =
    parseDurationMinutes(best.connection.duration) ||
    Math.round((best.arrival.getTime() - best.departure.getTime()) / 60_000);
  const stationReadyTime = new Date(
    startTime.getTime() + origin.bikeMinutes * 60_000,
  );
  const waitMinutes = Math.max(
    STATION_BUFFER_MINUTES,
    Math.round((best.departure.getTime() - stationReadyTime.getTime()) / 60_000),
  );
  const totalMinutes = Math.round(
    (best.arrival.getTime() - startTime.getTime()) / 60_000 +
      destination.bikeMinutes,
  );
  const transitLegs = transitLegsFromSections(best.connection.sections);

  return {
    id: `${origin.id}-${destination.id}-${best.departure.getTime()}`,
    startTime,
    originStation: origin,
    destinationStation: destination,
    departure: best.departure,
    arrival: best.arrival,
    trainMinutes,
    waitMinutes,
    totalMinutes,
    changes: Math.max(0, transitLegs.filter((leg) => leg.mode === "transit").length - 1),
    services: serviceLabels(best.connection),
    transitLegs,
  };
}

export async function findJourneys(
  originStations: Station[],
  destinationStations: Station[],
  startTime = new Date(),
  onProgress?: (completed: number, total: number) => void,
): Promise<Journey[]> {
  const pairs = originStations.flatMap((origin) =>
    destinationStations.map((destination) => ({ origin, destination })),
  );
  const journeys: Journey[] = [];
  const batchSize = 3;

  for (let index = 0; index < pairs.length; index += batchSize) {
    const batch = pairs.slice(index, index + batchSize);
    const batchStarted = Date.now();
    const results = await Promise.all(
      batch.map(async ({ origin, destination }) => {
        try {
          return await fetchStationPair(origin, destination, startTime);
        } catch (error) {
          if (error instanceof Error && error.message.includes("busy")) throw error;
          return null;
        }
      }),
    );
    journeys.push(...results.filter((journey): journey is Journey => Boolean(journey)));
    onProgress?.(Math.min(index + batch.length, pairs.length), pairs.length);

    const elapsed = Date.now() - batchStarted;
    if (index + batchSize < pairs.length && elapsed < 1_050) {
      await new Promise((resolve) => window.setTimeout(resolve, 1_050 - elapsed));
    }
  }

  return journeys.sort((a, b) => a.totalMinutes - b.totalMinutes).slice(0, 5);
}
