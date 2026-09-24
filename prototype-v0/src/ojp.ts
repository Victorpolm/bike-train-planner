import { XMLParser, XMLValidator } from "fast-xml-parser";
import { interpretBicycleAttributes, type BicycleAttribute, type CarriageRule } from "./bicycleCarriage.ts";
import type { TransitLeg } from "./routing.ts";

export type OjpStop = { id: string; name: string; lat: number; lon: number };
export type OjpQuery = { from: OjpStop; to: OjpStop; departure: string };
export type OjpReference = NonNullable<TransitLeg["ojp"]>;
export type OjpLeg = {
  mode: "transit" | "walk"; from: OjpStop; to: OjpStop; departure: string; arrival: string;
  service: string; serviceName: string | null; category: string | null; operator: string | null;
  direction: string | null; departurePlatform: string | null; arrivalPlatform: string | null;
  reference?: OjpReference; rule?: CarriageRule;
};
export type OjpConnections = { legs: OjpLeg[]; checked: string; warnings: string[] };
export type OjpDetails = { rule: CarriageRule; checked: string };

// XML is confined to this provider boundary. No provider markup reaches innerHTML.
type Xml = Record<string, any>;
const list = <T>(value: T | T[] | undefined | null): T[] => value == null ? [] : Array.isArray(value) ? value : [value];
const text = (value: unknown): string => typeof value === "string" ? value : value && typeof value === "object"
  ? text((value as Xml)["#text"] ?? (value as Xml).Text) : "";
const instant = (value: unknown) => { const s = text(value); return s && Number.isFinite(Date.parse(s)) ? new Date(s).toISOString() : null; };
const attributes = (node: Xml | undefined, scope: BicycleAttribute["scope"]): BicycleAttribute[] => list<Xml>(node?.Attribute)
  .map(a => ({ code: text(a.Code), text: text(a.UserText), scope }));

function delivery(xml: string, kind: "OJPTripDelivery" | "OJPTripInfoDelivery"): Xml {
  if (xml.length > 8_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error("Invalid OJP response");
  const parsed = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false }).parse(xml);
  const service = parsed.OJP?.OJPResponse?.ServiceDelivery;
  const result = list<Xml>(service?.[kind])[0];
  if (!result || service.Status === "false" || result.Status === "false" || service.ErrorCondition || result.ErrorCondition) {
    throw new Error("OJP did not provide a usable timetable response");
  }
  return result;
}

function places(context: Xml | undefined) {
  const map = new Map<string, OjpStop>();
  const entries = list<Xml>(context?.Places?.Place);
  for (const p of entries) {
    const item = p.StopPlace ?? p.StopPoint;
    const ref = text(item?.StopPlaceRef ?? item?.StopPointRef);
    const name = text(item?.StopPlaceName ?? item?.StopPointName ?? p.Name);
    const lat = Number(text(p.GeoPosition?.Latitude)), lon = Number(text(p.GeoPosition?.Longitude));
    if (ref && name && text(p.GeoPosition?.Latitude) && text(p.GeoPosition?.Longitude)
      && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) map.set(ref, { id: ref, name, lat, lon });
  }
  // Collapse only the explicit provider parent relation. Never derive a SLOID
  // arithmetically from a legacy station number or guess from a platform suffix.
  for (const p of entries) {
    const ref = text(p.StopPoint?.StopPointRef), parent = map.get(text(p.StopPoint?.ParentRef));
    if (ref && parent) map.set(ref, parent);
  }
  return map;
}

function duration(value: unknown) {
  const m = text(value).match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  return m ? ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 1000 : NaN;
}
export function ojpLegKey(leg: OjpLeg) {
  return JSON.stringify([leg.mode, leg.reference?.journeyRef, leg.reference?.operatingDay,
    leg.reference?.fromRef ?? leg.from.id, leg.reference?.toRef ?? leg.to.id, leg.departure, leg.arrival, leg.operator]);
}

export function parseOjpConnections(xml: string, bikeFiltered: boolean): OjpLeg[] {
  const data = delivery(xml, "OJPTripDelivery"), stops = places(data.TripResponseContext);
  const legs: OjpLeg[] = [];
  for (const result of list<Xml>(data.TripResult)) {
    const trip = result.Trip;
    if (!trip) continue;
    let previousArrival: string | null = null;
    for (const item of list<Xml>(trip.Leg)) {
      const timed = item.TimedLeg, transfer = item.TransferLeg;
      if (timed) {
        const board = timed.LegBoard, alight = timed.LegAlight, service = timed.Service;
        const fromRef = text(board?.StopPointRef), toRef = text(alight?.StopPointRef);
        const from = stops.get(fromRef), to = stops.get(toRef);
        const departure = instant(board?.ServiceDeparture?.TimetabledTime), arrival = instant(alight?.ServiceArrival?.TimetabledTime);
        previousArrival = arrival;
        if (!service || !from || !to || !departure || !arrival || arrival < departure) continue;
        const journeyRef = text(service.JourneyRef), operatingDay = text(service.OperatingDayRef);
        const fromOrder = Number(text(board.Order)), toOrder = Number(text(alight.Order));
        if (!journeyRef || !/^\d{4}-\d{2}-\d{2}$/.test(operatingDay) || !Number.isInteger(fromOrder) || !Number.isInteger(toOrder) || toOrder <= fromOrder) continue;
        const scoped = [
          ...attributes(service, "service"), ...attributes(timed, "segment"),
          ...[board, ...list<Xml>(timed.LegIntermediate), alight].flatMap(call => attributes(call, "stop")),
        ];
        const mode = text(service.Mode?.PtMode), label = text(service.PublicCode) || text(service.PublishedServiceName) || mode;
        const category = ({ bus: "B", tram: "Tram", metro: "M", water: "BAT", rail: text(service.ProductCategory?.ShortName) || "Train" } as Record<string, string>)[mode] || mode;
        const serviceLabel = label.startsWith(category) ? label : [category, label].filter(Boolean).join(" ");
        legs.push({ mode: "transit", from, to, departure, arrival, service: serviceLabel,
          serviceName: text(service.PublishedServiceName) || null, category,
          operator: text(service.OperatorRef) || null, direction: text(service.DestinationText) || null,
          departurePlatform: text(board.PlannedQuay) || null, arrivalPlatform: text(alight.PlannedQuay) || null,
          reference: { journeyRef, operatingDay, fromRef, toRef, fromOrder, toOrder, departure, arrival, bikeFiltered, attributes: scoped },
          rule: interpretBicycleAttributes(scoped, bikeFiltered),
        });
      } else if (transfer && previousArrival && text(transfer.TransferType) === "walk") {
        const from = stops.get(text(transfer.LegStart?.StopPointRef)), to = stops.get(text(transfer.LegEnd?.StopPointRef));
        const ms = duration(transfer.Duration ?? item.Duration), departure = previousArrival;
        if (!Number.isFinite(ms) || ms < 0) { previousArrival = null; continue; }
        previousArrival = new Date(Date.parse(departure) + ms).toISOString();
        if (from && to) legs.push({ mode: "walk", from, to, departure, arrival: previousArrival,
          service: "Transfer on foot", serviceName: null, category: null, operator: null,
          direction: null, departurePlatform: null, arrivalPlatform: null });
      }
      // Leading/trailing provider walks are replaced by our road-routed cycling.
    }
  }
  return legs;
}

export function mergeOjpConnections(unfiltered: OjpLeg[], filtered: OjpLeg[]): OjpLeg[] {
  const result = new Map<string, OjpLeg>();
  for (const leg of [...unfiltered, ...filtered]) {
    const key = ojpLegKey(leg), existing = result.get(key);
    if (!existing) { result.set(key, leg); continue; }
    if (!leg.reference || !existing.reference) continue;
    // Keep a prohibition even if a second response is filtered or omits the note.
    const attributes = [...existing.reference.attributes, ...leg.reference.attributes];
    const bikeFiltered = existing.reference.bikeFiltered || leg.reference.bikeFiltered;
    result.set(key, { ...leg, reference: { ...leg.reference, attributes, bikeFiltered }, rule: interpretBicycleAttributes(attributes, bikeFiltered) });
  }
  return [...result.values()];
}

export function parseOjpTripInfo(xml: string, ref: OjpReference): CarriageRule {
  const data = delivery(xml, "OJPTripInfoDelivery");
  const results = list<Xml>(data.TripInfoResult);
  if (results.length !== 1) throw new Error("Missing or ambiguous service details");
  const result = results[0], service = result.Service;
  if (text(service?.JourneyRef) !== ref.journeyRef || text(service?.OperatingDayRef) !== ref.operatingDay) throw new Error("Dated service mismatch");
  const calls = [...list<Xml>(result.PreviousCall), ...list<Xml>(result.ThisCall), ...list<Xml>(result.OnwardCall)]
    .sort((a, b) => Number(text(a.Order)) - Number(text(b.Order)));
  const from = calls.findIndex(c => text(c.StopPointRef) === ref.fromRef && instant(c.ServiceDeparture?.TimetabledTime) === ref.departure);
  const to = calls.findIndex((c, i) => i > from && text(c.StopPointRef) === ref.toRef && instant(c.ServiceArrival?.TimetabledTime) === ref.arrival);
  if (from < 0 || to <= from) throw new Error("Service details do not identify the boarded segment");
  return interpretBicycleAttributes([...attributes(service, "service"), ...calls.slice(from, to + 1).flatMap(c => attributes(c, "stop"))]);
}

const escape = (s: string) => s.replace(/[<>&"']/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
function envelope(kind: string, content: string, now: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" version="2.0"><OJPRequest><siri:ServiceRequest><siri:RequestTimestamp>${escape(now)}</siri:RequestTimestamp><siri:RequestorRef>bike-train-planner</siri:RequestorRef><${kind}><siri:RequestTimestamp>${escape(now)}</siri:RequestTimestamp><siri:MessageIdentifier>bike-app-${escape(now)}</siri:MessageIdentifier>${content}</${kind}></siri:ServiceRequest></OJPRequest></OJP>`;
}
export function ojpTripRequest(query: OjpQuery, filtered: boolean, now: string) {
  const endpoint = (name: string, stop: OjpStop) => `<${name}><PlaceRef><GeoPosition><siri:Longitude>${stop.lon}</siri:Longitude><siri:Latitude>${stop.lat}</siri:Latitude></GeoPosition><Name><Text>${escape(stop.name)}</Text></Name></PlaceRef>${name === "Origin" ? `<DepArrTime>${escape(query.departure)}</DepArrTime>` : ""}</${name}>`;
  return envelope("OJPTripRequest", endpoint("Origin", query.from) + endpoint("Destination", query.to)
    + `<Params><NumberOfResults>4</NumberOfResults><UseRealtimeData>none</UseRealtimeData><IncludeIntermediateStops>true</IncludeIntermediateStops><BikeTransport>${filtered}</BikeTransport></Params>`, now);
}
export function ojpTripInfoRequest(ref: OjpReference, now: string) {
  return envelope("OJPTripInfoRequest", `<JourneyRef>${escape(ref.journeyRef)}</JourneyRef><OperatingDayRef>${escape(ref.operatingDay)}</OperatingDayRef><Params><UseRealtimeData>none</UseRealtimeData><IncludeCalls>true</IncludeCalls><IncludeService>true</IncludeService></Params>`, now);
}
