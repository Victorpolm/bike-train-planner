import { parseSwissDateTime } from "./departure.ts";
import type { TransportSection, TransportStop } from "./itinerary.ts";
import type { BicycleAttribute } from "./bicycleCarriage.ts";

type SearchStop = { stopid?: string; name?: string; lat?: number; lon?: number;
  arrival?: string | null; departure?: string | null; track?: string | null };
type SearchLeg = SearchStop & { exit?: SearchStop; type?: string; line?: string; tripid?: string; number?: string;
  operator?: string; terminal?: string; "*G"?: string; "*L"?: string;
  stops?: SearchStop[] | null; attributes?: Record<string, string> };
export type SearchTimetableResponse = { connections?: { legs?: SearchLeg[] }[]; url?: string; error?: string };

// These times are Swiss wall times, even on a device in another timezone.
export function searchTime(value?: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[3]) > 59) return null;
  try { return new Date(parseSwissDateTime(`${match[1]}T${match[2]}`).getTime() + Number(match[3]) * 1000).toISOString(); }
  catch { return null; }
}
function stop(value: SearchStop): TransportStop {
  return { station: { id: value.stopid, name: value.name,
    coordinate: { x: value.lat ?? null, y: value.lon ?? null } },
    arrival: searchTime(value.arrival), departure: searchTime(value.departure), platform: value.track };
}
export function searchBicycleAttributes(attributes: SearchLeg["attributes"]): BicycleAttribute[] {
  return Object.entries(attributes ?? {}).filter(([, text]) => typeof text === "string")
    .map(([code, text]) => ({ code: /^\d+_[\d.]+_V[NRBICKT]$/.test(code) ? `A__${code.split("_").at(-1)}` : code,
      text, scope: "service" as const }));
}
export function searchSections(data: SearchTimetableResponse, checked = new Date().toISOString()): TransportSection[][] {
  const source = { title: "search.ch dated timetable and bicycle conditions",
    url: /^https:\/\/(?:timetable\.|fahrplan\.)?search\.ch\//.test(data.url ?? "") ? data.url! : "https://search.ch/timetable/", checked };
  return (data.connections ?? []).map(connection => (connection.legs ?? []).filter(leg => leg.exit).map(leg => {
    const walking = leg.type === "walk";
    const category = ["bus", "post"].includes(leg.type ?? "") ? (["EV", "SEV"].includes(leg["*G"] ?? "") ? leg["*G"] : "B")
      : leg.type === "tram" ? "T" : leg.type === "ship" ? "BAT"
      : leg["*G"] || ({ strain: "S", train: "R", express_train: "IR", cableway: "CABLEWAY" }[leg.type ?? ""] ?? leg.type);
    return { departure: stop(leg), arrival: stop(leg.exit!), ...(walking ? { walk: true } : { journey: {
      category, number: leg["*L"] || leg.line?.replace(/^[A-Z]+\s*(?=\d)/i, ""),
      name: leg.number || leg.line, operator: leg.operator, to: leg.terminal,
      passList: (leg.stops ?? []).map(stop),
      bicycleData: { attributes: searchBicycleAttributes(leg.attributes), source },
    } }) };
  }));
}
