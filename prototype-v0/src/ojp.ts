import { mergeAccessRules, mergeTransferRules, type StationAccessRule, type StationTransferRule } from "./transferTimes.ts";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { interpretBicycleAttributes, type BicycleAttribute, type CarriageRule } from "./bicycleCarriage.ts";
import type { TransitLeg } from "./routing.ts";

export type OjpStop = { id: string; name: string; lat: number; lon: number };
export type OjpQuery = { from: OjpStop; to: OjpStop; departure: string; arriveBy?: boolean };
export type OjpReference = NonNullable<TransitLeg["ojp"]>;
export type OjpLeg = {
  transferRules?: StationTransferRule[];
  accessRules?: StationAccessRule[];
  mode: "transit" | "walk"; from: OjpStop; to: OjpStop; departure: string; arrival: string;
  service: string; serviceName: string | null; category: string | null; operator: string | null;
  direction: string | null; departurePlatform: string | null; arrivalPlatform: string | null;
  reference?: OjpReference; rule?: CarriageRule;
  fareSourceIds?: string[];
};
export type OjpConnections = { legs: OjpLeg[]; checked: string; warnings: string[];
  fareSources?: import("./onlineFare.ts").RetainedFareSource[] };
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
function ojpLegKey(leg: OjpLeg) {
  return JSON.stringify([leg.mode, leg.reference?.journeyRef, leg.reference?.operatingDay,
    leg.reference?.fromRef ?? leg.from.id, leg.reference?.toRef ?? leg.to.id, leg.departure, leg.arrival, leg.operator]);
}

export function parseOjpConnections(xml: string, bikeFiltered: boolean): OjpLeg[] {
  const data = delivery(xml, "OJPTripDelivery"), stops = places(data.TripResponseContext);
  const legs: OjpLeg[] = [];
  const sameRef = (a: string, b: string) => a === b || stops.get(a)?.id === b || stops.get(b)?.id === a;
  for (const result of list<Xml>(data.TripResult)) {
    const trip = result.Trip;
    if (!trip) continue;
    let previousArrival: string | null = null;
    let previousRide: OjpLeg | null = null;
    let access: { point: { lat: number; lon: number }; toRef: string; seconds: number | null } | null = null;
    let pending: { kind: StationTransferRule["kind"]; seconds: number | null; from: string; to: string }[] = [];
    for (const item of list<Xml>(trip.Leg)) {
      const timed = item.TimedLeg, transfer = item.TransferLeg, continuous = item.ContinuousLeg;
      if (continuous && !previousRide) {
        const geo = continuous.LegStart?.GeoPosition, toRef = text(continuous.LegEnd?.StopPointRef ?? continuous.LegEnd?.StopPlaceRef);
        const lat = Number(text(geo?.Latitude)), lon = Number(text(geo?.Longitude)), ms = duration(continuous.Duration ?? item.Duration);
        access = text(continuous.Service?.PersonalMode) === "foot" && toRef && text(geo?.Latitude) && text(geo?.Longitude)
          && Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180
          ? { point: { lat, lon }, toRef, seconds: Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null } : null;
      }
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
        const previous = previousRide;
        const connected = previous?.reference && pending.length && sameRef(pending[0].from, previous.reference.toRef)
          && sameRef(pending.at(-1)!.to, fromRef) && pending.every((part, i) => i === 0 || sameRef(pending[i - 1].to, part.from));
        const transferRules: StationTransferRule[] = previous?.reference && pending.length ? [{
          incomingJourneyRef: previous.reference.journeyRef, incomingOperatingDay: previous.reference.operatingDay, operatingDay, fromRef: previous.reference.toRef, toRef: fromRef,
          arrival: previous.arrival, departure, seconds: connected && pending.every(p => p.seconds !== null) ? pending.reduce((s, p) => s + p.seconds!, 0) : null,
          kind: !connected || pending.some(p => p.kind === "unknown") ? "unknown" : pending.some(p => p.kind === "guaranteedConnection") ? "guaranteedConnection" : "walk",
          checked: instant(data.ResponseTimestamp) ?? undefined,
        }] : [];
        const accessRules: StationAccessRule[] = !previousRide && access && sameRef(access.toRef, fromRef)
          ? [{ ...access, toRef: fromRef, departure, operatingDay, checked: instant(data.ResponseTimestamp) ?? undefined }] : [];
        const parsed: OjpLeg = { accessRules, mode: "transit", from, to, departure, arrival, service: serviceLabel, transferRules,
          serviceName: text(service.PublishedServiceName) || null, category,
          operator: text(service.OperatorRef) || null, direction: text(service.DestinationText) || null,
          departurePlatform: text(board.PlannedQuay) || null, arrivalPlatform: text(alight.PlannedQuay) || null,
          reference: { journeyRef, operatingDay, fromRef, toRef, fromOrder, toOrder, departure, arrival, bikeFiltered, attributes: scoped },
          rule: interpretBicycleAttributes(scoped, bikeFiltered),
        };
        legs.push(parsed); previousRide = parsed; pending = []; access = null;
      } else if (transfer && previousRide) {
        const kinds = list<unknown>(transfer.TransferType).map(text);
        const kind = kinds.length && kinds.every(k => ["walk", "guaranteedConnection", "protectedConnection"].includes(k))
          ? kinds.includes("guaranteedConnection") || kinds.includes("protectedConnection") ? "guaranteedConnection" : "walk" : "unknown";
        const ms = duration(transfer.Duration ?? item.Duration);
        pending.push({ from: text(transfer.LegStart?.StopPointRef ?? transfer.LegStart?.StopPlaceRef), to: text(transfer.LegEnd?.StopPointRef ?? transfer.LegEnd?.StopPlaceRef),
          kind: kind === "walk" || kind === "guaranteedConnection" ? kind : "unknown",
          seconds: Number.isFinite(ms) && ms >= 0 ? ms / 1000 : null });
        if (!previousArrival || !["walk", "guaranteedConnection"].includes(kind)) { previousArrival = null; continue; }
        const from = stops.get(text(transfer.LegStart?.StopPointRef ?? transfer.LegStart?.StopPlaceRef)), to = stops.get(text(transfer.LegEnd?.StopPointRef ?? transfer.LegEnd?.StopPlaceRef));
        const departure = previousArrival;
        if (!Number.isFinite(ms) || ms < 0) { previousArrival = null; continue; }
        previousArrival = new Date(Date.parse(departure) + ms).toISOString();
        if (from && to && from.id !== to.id) legs.push({ mode: "walk", from, to, departure, arrival: previousArrival,
          service: "Transfer on foot", serviceName: null, category: null, operator: null,
          direction: null, departurePlatform: null, arrivalPlatform: null });
      }
      // Leading foot access is scoped to its exact station point; trailing walks stay outside this adapter.
    }
  }
  return legs;
}

export function mergeOjpConnections(unfiltered: OjpLeg[], filtered: OjpLeg[]): OjpLeg[] {
  const result = new Map<string, OjpLeg>();
  for (const leg of [...unfiltered, ...filtered]) {
    const key = ojpLegKey(leg), existing = result.get(key);
    if (!existing) { result.set(key, leg); continue; }
    const transferRules = mergeTransferRules(existing.transferRules, leg.transferRules);
    const accessRules = mergeAccessRules(existing.accessRules, leg.accessRules);
    const fareSourceIds = [...new Set([...(existing.fareSourceIds ?? []), ...(leg.fareSourceIds ?? [])])];
    if (!leg.reference || !existing.reference) { result.set(key, { ...existing, fareSourceIds, transferRules, accessRules }); continue; }
    // Keep a prohibition even if a second response is filtered or omits the note.
    const attributes = [...existing.reference.attributes, ...leg.reference.attributes];
    const bikeFiltered = existing.reference.bikeFiltered || leg.reference.bikeFiltered;
    result.set(key, { ...leg, fareSourceIds, transferRules, accessRules,
      reference: { ...leg.reference, attributes, bikeFiltered }, rule: interpretBicycleAttributes(attributes, bikeFiltered) });
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
  const endpoint = (name: string, stop: OjpStop) => `<${name}><PlaceRef><GeoPosition><siri:Longitude>${stop.lon}</siri:Longitude><siri:Latitude>${stop.lat}</siri:Latitude></GeoPosition><Name><Text>${escape(stop.name)}</Text></Name></PlaceRef>${name === (query.arriveBy ? "Destination" : "Origin") ? `<DepArrTime>${escape(query.departure)}</DepArrTime>` : ""}</${name}>`;
  return envelope("OJPTripRequest", endpoint("Origin", query.from) + endpoint("Destination", query.to)
    + `<Params><NumberOfResults>4</NumberOfResults><UseRealtimeData>none</UseRealtimeData><IncludeIntermediateStops>true</IncludeIntermediateStops><BikeTransport>${filtered}</BikeTransport></Params>`, now);
}
export function ojpTripInfoRequest(ref: OjpReference, now: string) {
  return envelope("OJPTripInfoRequest", `<JourneyRef>${escape(ref.journeyRef)}</JourneyRef><OperatingDayRef>${escape(ref.operatingDay)}</OperatingDayRef><Params><UseRealtimeData>none</UseRealtimeData><IncludeCalls>true</IncludeCalls><IncludeService>true</IncludeService></Params>`, now);
}
