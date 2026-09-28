import { XMLBuilder, XMLParser, XMLValidator } from "fast-xml-parser";
import type { FareSegment, FareOffer } from "../src/onlineFare.ts";

type Xml = Record<string, any>;
const list = <T>(v: T | T[] | undefined): T[] => v == null ? [] : Array.isArray(v) ? v : [v];
const local = (key: string) => key.split(":").at(-1)!;
const field = (v: Xml | undefined, name: string): any => v && v[Object.keys(v).find(k => !k.startsWith("@_") && local(k) === name) ?? ""];
const text = (v: any): string => v == null ? "" : typeof v === "object" ? text(v["#text"] ?? field(v, "Text")) : String(v).trim();
const escape = (s: string) => s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const durationMilliseconds = (v: unknown) => {
  const m = text(v).match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  return m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 1000 : NaN;
};
function parse(xml: string): Xml {
  if (xml.length > 8_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Invalid fare XML");
  return new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false }).parse(xml);
}
function envelope(content: string, namespaces: Xml = {}) {
  const ns = { "@_xmlns": "http://www.vdv.de/ojp", "@_xmlns:siri": "http://www.siri.org.uk/siri", ...namespaces };
  const attributes = Object.entries(ns).map(([k, v]) => `${k.slice(2)}="${escape(String(v))}"`).join(" ");
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<OJP ${attributes} version="2.0"><OJPRequest><siri:ServiceRequest><siri:RequestTimestamp>${now}</siri:RequestTimestamp><siri:RequestorRef>bike-train-planner-fares</siri:RequestorRef>${content}</siri:ServiceRequest></OJPRequest></OJP>`;
}
export function fareTripRequest(segments: FareSegment[]) {
  const endpoint = (role: string, ref: string) => `<${role}><PlaceRef><StopPlaceRef>${escape(ref)}</StopPlaceRef><Name><Text>${escape(ref)}</Text></Name></PlaceRef>${role === "Origin" ? `<DepArrTime>${escape(segments[0].departure)}</DepArrTime>` : ""}</${role}>`;
  return envelope(`<OJPTripRequest><siri:RequestTimestamp>${new Date().toISOString()}</siri:RequestTimestamp>${endpoint("Origin", segments[0].from)}${endpoint("Destination", segments.at(-1)!.to)}<Params><NumberOfResults>6</NumberOfResults><UseRealtimeData>none</UseRealtimeData><IncludeIntermediateStops>true</IncludeIntermediateStops></Params></OJPTripRequest>`);
}
export type FareTrip = { raw: Xml; name: string; namespaces: Xml; firstLeg: string; lastLeg: string; segments: FareSegment[] };
export function fareTrips(xml: string): FareTrip[] {
  const root = field(parse(xml), "OJP"), service = field(field(root, "OJPResponse"), "ServiceDelivery");
  const data = list<Xml>(field(service, "OJPTripDelivery"))[0];
  if (!data || text(field(service, "Status")) === "false" || field(service, "ErrorCondition") || text(field(data, "Status")) === "false" || field(data, "ErrorCondition")) throw new Error("No fare itinerary");
  const parents = new Map<string, string>();
  const positions = new Map<string, { lat: number; lon: number }>();
  for (const place of list<Xml>(field(field(field(data, "TripResponseContext"), "Places"), "Place"))) {
    const point = field(place, "StopPoint"), ref = text(field(point, "StopPointRef")), parent = text(field(point, "ParentRef"));
    if (ref && parent) parents.set(ref, parent);
    const id = ref || text(field(field(place, "StopPlace"), "StopPlaceRef")), geo = field(place, "GeoPosition");
    if (id && geo) positions.set(id, { lat: Number(text(field(geo, "Latitude"))), lon: Number(text(field(geo, "Longitude"))) });
  }
  const commercial = (id: string) => { const seen = new Set<string>(); while (parents.has(id) && !seen.has(id)) { seen.add(id); id = parents.get(id)!; } return id; };
  const replaceStops = (v: Xml) => { for (const [k, item] of Object.entries(v)) {
    if (local(k) === "StopPointRef") v[k] = commercial(text(item));
    else if (item && typeof item === "object") for (const nested of list<Xml>(item)) replaceStops(nested);
  } };
  return list<Xml>(field(data, "TripResult")).flatMap(result => {
    const name = Object.keys(result).find(k => local(k) === "Trip");
    if (!name) return [];
    const raw = structuredClone(result[name]); replaceStops(raw);
    const timed = list<Xml>(field(raw, "Leg")).filter(l => field(l, "TimedLeg"));
    if (!timed.length) return [];
    const segments = timed.map(leg => {
      const timed = field(leg, "TimedLeg"), board = field(timed, "LegBoard"), alight = field(timed, "LegAlight");
      return { from: text(field(board, "StopPointRef")), to: text(field(alight, "StopPointRef")),
        fromName: text(field(board, "StopPointName")), toName: text(field(alight, "StopPointName")),
        fromPoint: positions.get(text(field(board, "StopPointRef"))), toPoint: positions.get(text(field(alight, "StopPointRef"))),
        departure: text(field(field(board, "ServiceDeparture"), "TimetabledTime")),
        arrival: text(field(field(alight, "ServiceArrival"), "TimetabledTime")),
        journeyRef: text(field(field(timed, "Service"), "JourneyRef")) };
    });
    const namespaces = Object.assign({}, ...[root, field(root, "OJPResponse"), service, data, result]
      .map(v => Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith("@_xmlns")))));
    return [{ raw, name, namespaces,
      firstLeg: text(field(timed[0], "Id")), lastLeg: text(field(timed.at(-1), "Id")), segments }];
  });
}
export function matchesFareSegment(s: FareSegment, e: FareSegment): boolean {
  const name = (n?: string) => n?.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const sameStop = (a: FareSegment, b: FareSegment, role: "from" | "to") => {
    if (a[role] === b[role]) return true;
    const ap = a[`${role}Point`], bp = b[`${role}Point`];
    // Legacy stop IDs and SLOIDs are not interchangeable. Require the same
    // station name and every scheduled service time. Large stations have
    // entrances/platform centroids over 300 m apart (observed at Zürich HB).
    // This is a station identity bound, not a walking/cycling connector limit.
    return !!ap && !!bp && !!name(a[`${role}Name`]) && name(a[`${role}Name`]) === name(b[`${role}Name`])
      && Math.hypot((ap.lat - bp.lat) * 111320, (ap.lon - bp.lon) * 76000) <= 500;
  };
  return sameStop(s, e, "from") && sameStop(s, e, "to") && Date.parse(s.departure) === Date.parse(e.departure)
    && Date.parse(s.arrival) === Date.parse(e.arrival) && (!e.journeyRef || e.journeyRef === s.journeyRef);
}
export function matchingFareTrip(trips: FareTrip[], expected: FareSegment[]): FareTrip | undefined {
  return trips.find(t => t.segments.length === expected.length && t.segments.every((s, i) => matchesFareSegment(s, expected[i])));
}

export function fareTripWalks(trip: FareTrip): FareSegment[] {
  const walks: FareSegment[] = []; let previousArrival = NaN;
  for (const leg of list<Xml>(field(trip.raw, "Leg"))) {
    const timed = field(leg, "TimedLeg"), transfer = field(leg, "TransferLeg");
    if (timed) previousArrival = Date.parse(text(field(field(field(timed, "LegAlight"), "ServiceArrival"), "TimetabledTime")));
    else if (transfer && text(field(transfer, "TransferType")) === "walk" && Number.isFinite(previousArrival)) {
      const ms = durationMilliseconds(field(transfer, "Duration") ?? field(leg, "Duration"));
      if (!Number.isFinite(ms) || ms < 0) { previousArrival = NaN; continue; }
      const start = field(transfer, "LegStart"), end = field(transfer, "LegEnd");
      walks.push({ from: text(field(start, "StopPointRef")), to: text(field(end, "StopPointRef")),
        departure: new Date(previousArrival).toISOString(), arrival: new Date(previousArrival + ms).toISOString() });
      previousArrival += ms;
    }
  }
  return walks;
}

/** Build only from the selected provider legs; never rerun an OD search. */
export function retainedFareTrip(trips: FareTrip[], expected: FareSegment[]): { trip: FareTrip; source: "retained" | "assembled" } | undefined {
  const whole = matchingFareTrip(trips, expected);
  if (whole) return { trip: whole, source: "retained" };
  const parts = expected.map(e => {
    for (const trip of trips) {
      const i = trip.segments.findIndex(s => matchesFareSegment(s, e));
      if (i >= 0) return { trip, segment: trip.segments[i], leg: list<Xml>(field(trip.raw, "Leg")).filter(l => field(l, "TimedLeg"))[i] };
    }
    return undefined;
  });
  if (!parts.length || parts.some(p => !p?.leg)) return undefined;
  const selected = parts as NonNullable<typeof parts[number]>[];
  const scoped = (leg: Xml, trip: FareTrip) => ({ ...trip.namespaces, ...structuredClone(leg) });
  // Use a provider's actual transfer path between different commercial stops.
  // Waiting at the same commercial stop needs no invented walking leg.
  const bridge = (from: string, to: string, available: number): Xml[] | undefined => {
    let knownPath = false;
    for (const trip of trips) {
      const legs = list<Xml>(field(trip.raw, "Leg"));
      for (let start = 0; start < legs.length; start++) {
        let current = from, elapsed = 0; const path: Xml[] = [];
        for (const leg of legs.slice(start)) {
          const transfer = field(leg, "TransferLeg");
          if (!transfer || text(field(transfer, "TransferType")) !== "walk"
            || text(field(field(transfer, "LegStart"), "StopPointRef")) !== current) break;
          current = text(field(field(transfer, "LegEnd"), "StopPointRef"));
          elapsed += durationMilliseconds(field(transfer, "Duration") ?? field(leg, "Duration"));
          if (current === to) knownPath = true;
          if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > available) break;
          path.push(scoped(leg, trip));
          if (current === to) return path;
        }
      }
    }
    return from === to && !knownPath ? [] : undefined;
  };
  const legs: Xml[] = [], segments = selected.map(p => p.segment);
  for (const [i, part] of selected.entries()) {
    if (i) {
      const previous = selected[i - 1].segment;
      const gap = Date.parse(part.segment.departure) - Date.parse(previous.arrival);
      if (!Number.isFinite(gap) || gap < 0) return undefined;
      const transfer = bridge(previous.to, part.segment.from, gap);
      if (!transfer) return undefined;
      legs.push(...transfer);
    }
    legs.push(scoped(part.leg, part.trip));
  }
  // Recalculate trip-wide fields; copying a source trip's aggregates would
  // describe stops and legs that the traveller did not select.
  const base = selected[0].trip, prefix = base.name.includes(":") ? base.name.slice(0, base.name.lastIndexOf(":") + 1) : "";
  let firstLeg = "", lastLeg = "";
  legs.forEach((leg, i) => {
    const id = Object.keys(leg).find(k => local(k) === "Id") ?? prefix + "Id";
    leg[id] = String(i + 1);
    if (field(leg, "TimedLeg")) { firstLeg ||= leg[id]; lastLeg = leg[id]; }
  });
  const raw = { [prefix + "Id"]: "selected-trip",
    [prefix + "Duration"]: `PT${(Date.parse(segments.at(-1)!.arrival) - Date.parse(segments[0].departure)) / 1000}S`,
    [prefix + "StartTime"]: segments[0].departure, [prefix + "EndTime"]: segments.at(-1)!.arrival,
    [prefix + "Transfers"]: String(segments.length - 1), [prefix + "Leg"]: legs };
  return { trip: { raw, name: base.name, namespaces: base.namespaces, firstLeg, lastLeg, segments }, source: "assembled" };
}
export function fareRequest(trip: FareTrip, profile: "full" | "half-fare" | "bicycle") {
  const raw = structuredClone(trip.raw), id = Object.keys(raw).find(k => local(k) === "Id");
  if (!id) throw new Error("Missing trip id"); raw[id] = "farequote";
  const tripXml = new XMLBuilder({ ignoreAttributes: false }).build({ [trip.name]: { ...trip.namespaces, ...raw } });
  const entitlement = profile === "half-fare" ? "<EntitlementProduct><FareAuthorityRef>ch:1:NOVA</FareAuthorityRef><EntitlementProductRef>HTA</EntitlementProductRef><EntitlementProductName>Halbtax-Abonnement</EntitlementProductName></EntitlementProduct>" : "";
  return envelope(`<OJPFareRequest><siri:RequestTimestamp>${new Date().toISOString()}</siri:RequestTimestamp><TripFareRequest>${tripXml}</TripFareRequest><Params><FareAuthorityFilter>ch:1:NOVA</FareAuthorityFilter><FareClass>secondClass </FareClass><Traveller><Age>25</Age><PassengerCategory>${profile === "bicycle" ? "Bicycle" : "Adult"}</PassengerCategory><EntitlementProducts>${entitlement}</EntitlementProducts></Traveller></Params></OJPFareRequest>`);
}
export function parseFare(xml: string, trip: FareTrip, profile: "full" | "half-fare" | "bicycle"): FareOffer | null {
  const document = parse(xml), service = field(field(field(document, "OJP"), "OJPResponse"), "ServiceDelivery");
  const data = field(document, "OJPFareDelivery") ?? list<Xml>(field(service, "OJPFareDelivery"))[0];
  if (!data || text(field(data, "Status")) !== "true" || field(data, "ErrorCondition") || field(service, "ErrorCondition")) throw new Error("No fare delivery");
  const offers: FareOffer[] = [];
  for (const result of list<Xml>(field(data, "FareResult"))) {
    if (text(field(result, "Id")) !== "farequote") continue;
    for (const scope of list<Xml>(field(result, "TripFareResult"))) {
      if (text(field(scope, "FromLegIdRef")) !== trip.firstLeg || text(field(scope, "ToLegIdRef")) !== trip.lastLeg) continue;
      for (const product of list<Xml>(field(scope, "FareProduct"))) {
        const price = text(field(product, "Price")), chf = Number(price), productId = text(field(product, "FareProductId"));
        const cards = list<Xml | string>(field(product, "RequiredCard")).map(c => typeof c === "string" ? c : text(field(c, "EntitlementProductRef")));
        if (!price || !Number.isFinite(chf) || chf < 0 || text(field(product, "Currency")) !== "CHF"
          || !(text(field(product, "FareClass")) === "secondClass" || profile === "bicycle" && !text(field(product, "FareClass")))
          || text(field(product, "ProtoProduct")) === "true"
          || cards.some(c => c !== "HTA" || profile !== "half-fare")) continue;
        offers.push({ chf, productId, product: text(field(product, "FareProductName")) || productId });
      }
    }
  }
  // Prefer the ordinary through ticket when offered; otherwise retain the
  // named cheapest complete product. Never add overlapping product alternatives.
  offers.sort((a, b) => Number(b.productId === "125") - Number(a.productId === "125") || a.chf - b.chf);
  return offers[0] ?? null;
}
