import { normalizeName, operatorCode } from "./normalization.ts";
import type { CarriageRule } from "./bicycleCarriage.ts";

const FORMATION_SOURCE = "https://opentransportdata.swiss/en/cookbook/realtime-prediction-cookbook/formationsdaten/";
export type FormationReference = { journeyRef: string; operatingDay: string; trainNumber: string; evu: string;
  operator: string; from: string; to: string; departure: string; arrival: string };
export type FormationEvidence = {
  status: "matched" | "no-data" | "unmatched" | "outside-window" | "not-supported" | "missing-key" | "auth-failed" | "unavailable";
  providerStatus?: number; observed?: { symbols: string[]; vehicles: unknown[] };
  checked: string; message: string; rule?: CarriageRule; coaches?: string[]; source: string;
};
export function formationOperator(operator: string) {
  return ({ SBB: "SBBP", BLS: "BLSP", SOB: "SOB", RHB: "RhB", THURBO: "THURBO", TPF: "TPF", TRANSN: "TRN",
    MBC: "MBC", OEBB: "OeBB", VDBB: "VDBB", ZB: "ZB" } as Record<string, string>)[operatorCode(operator)];
}
export const formationResult = (status: FormationEvidence["status"], message: string, checked = new Date().toISOString()): FormationEvidence =>
  ({ status, message, checked, source: FORMATION_SOURCE });
export const freshFormation = (e?: FormationEvidence, now = Date.now()) => !!e && Number.isFinite(Date.parse(e.checked))
  && now - Date.parse(e.checked) >= -60_000 && now - Date.parse(e.checked) <= 120_000;

type Obj = Record<string, any>;
const list = (x: unknown): Obj[] => Array.isArray(x) && x.length <= 2000 ? x.filter(v => v && typeof v === "object") : [];
const stopId = (s: Obj | undefined) => Number.isInteger(s?.uic) ? String(s!.uic) : "";
const sameName = (a: unknown, b: string) => typeof a === "string" && normalizeName(a) === normalizeName(b);
const sameTime = (a: unknown, b: string) => typeof a === "string" && Date.parse(a) === Date.parse(b);

/** Strict CUS token parser, including shared offers after parenthesized
 * vehicle groups. Unknown syntax supplies no evidence. Only moving [] groups count. */
export function formationSymbols(value: unknown) {
  type Symbol = { number: string; reservation: boolean; bike: boolean; position: number; closed: boolean };
  if (typeof value !== "string" || value.length > 20000) return [] as Symbol[];
  const groups = [...value.matchAll(/\[([^\[\]]*)\]/g)];
  if (!groups.length || /[\[\]]/.test(value.replace(/\[[^\[\]]*\]/g, ""))) return [] as Symbol[];
  let position = 0;
  const result: Symbol[] = [];
  for (const group of groups) {
    const input = group[1].replace(/@[A-Z]/g, "").replace(/\s/g, "");
    let at = 0, valid = true;
    const suffix = () => {
      const match = input.slice(at).match(/^(?::(\d{1,3}))?(?:#([A-Z]+(?:;[A-Z]+)*))?/)!;
      at += match[0].length; return { number: match[1] ?? "", offers: match[2]?.split(";") ?? [] };
    };
    const sequence = (nested: boolean, depth = 0): Symbol[] => {
      if (depth > 12) { valid = false; return []; }
      const values: Symbol[] = [];
      while (at < input.length && input[at] !== ")") {
        if (/[,\\]/.test(input[at])) { at++; continue; }
        const status = input.slice(at).match(/^[-=>%]*/)?.[0] ?? ""; at += status.length;
        if (input[at] === "(") {
          at++; const children = sequence(true, depth + 1);
          if (!valid || input[at] !== ")") { valid = false; return []; }
          at++; const extra = suffix();
          for (const child of children) values.push({ ...child,
            number: children.length === 1 && extra.number ? extra.number : child.number,
            closed: child.closed || status.includes("-"),
            bike: !child.closed && !status.includes("-") && (child.bike || extra.offers.includes("VH") || extra.offers.includes("VR")),
            reservation: !child.closed && !status.includes("-") && (child.reservation || extra.offers.includes("VR")) });
          continue;
        }
        const type = input.slice(at).match(/^(12|CC|FA|WL|WR|W1|W2|LK|D|F|K|X|1|2)(?=[:#,\\)]|$)/)?.[0];
        if (!type) { valid = false; return []; }
        at += type.length; const extra = suffix(), closed = status.includes("-");
        if (!["X", "F"].includes(type)) values.push({ number: extra.number, position: ++position, closed,
          bike: !closed && type !== "LK" && (extra.offers.includes("VH") || extra.offers.includes("VR")),
          reservation: !closed && type !== "LK" && extra.offers.includes("VR") });
      }
      if (!nested && input[at] === ")") valid = false;
      return values;
    };
    result.push(...sequence(false));
    if (!valid || at !== input.length) return [] as Symbol[];
  }
  return result;
}

/** Match the dated journey AND the boarded interval. A vehicle must carry
 * through that interval; a bicycle facility elsewhere in the train is insufficient. */
export function parseFormation(data: unknown, ref: FormationReference, checked = new Date().toISOString()): FormationEvidence {
  const d = data as Obj;
  const miss = (message: string) => formationResult("unmatched", message, checked);
  if (!d || typeof d !== "object") return miss("The formation response could not be matched to this train.");
  const meta = d.journeyMetaInformation, train = d.trainMetaInformation;
  if (meta?.operationDate !== ref.operatingDay || String(train?.trainNumber) !== ref.trainNumber
    || (meta?.SJYID ? meta.SJYID !== ref.journeyRef : operatorCode("ojp:" + train?.toCode) !== operatorCode(ref.operator)))
    return miss("The returned formation belongs to a different or unverified dated train.");
  if (["N", "L"].includes(train?.runs)) return miss("The formation reports that this train is not running. Check the live service status.");
  const stops = list(d.formationsAtScheduledStops);
  const matches = (name: string, time: string, event: string) => stops.map((s, i) =>
    sameName(s.scheduledStop?.stopPoint?.name, name) && sameTime(s.scheduledStop?.stopTime?.[event], time) ? i : -1).filter(i => i >= 0);
  const starts = matches(ref.from, ref.departure, "departureTime"), ends = matches(ref.to, ref.arrival, "arrivalTime");
  let board = starts.length === 1 ? starts[0] : -1, alight = ends.length === 1 ? ends[0] : -1;
  const hasStops = board >= 0 && alight > board;
  if (stops.length && !hasStops) return miss("Formation stops or times do not match your boarded section.");
  if (hasStops) {
    const b = stops[board].scheduledStop, a = stops[alight].scheduledStop;
    const bits = (s: Obj, values: number[]) => values.some(bit => (Number(s.stopModifications) & (1 << (bit - 1))) !== 0);
    if (!["H", "+H", "E", "+E", "B", "BE"].includes(b.stopType) || !["H", "+H", "A", "+A", "B", "BA"].includes(a.stopType)
      || bits(b, [12, 22]) || bits(a, [11, 21])) return miss("Boarding or alighting is not confirmed in the formation for your section.");
  }
  const indices = (id: string) => stops.map((s, i) => id && stopId(s.scheduledStop?.stopPoint) === id ? i : -1).filter(i => i >= 0);
  const symbols = hasStops ? stops.slice(board, alight).map(s => formationSymbols(s.formationShort?.formationShortString)) : [];
  const eligible: Obj[] = [];
  for (const f of list(d.formations)) for (const v of list(f.formationVehicles)) {
    const p = v.vehicleProperties;
    if (!p || p.closed === true || p.vehicleWillBePutAway === true || /^Geschlossen/.test(p.trolleyStatus ?? "")) continue;
    // CUS offers can be present while the FOS equipment flags are all false.
    // Position is explicitly specified by the formation schema, unlike a
    // guessed train/stop identifier. Require the symbol throughout the section.
    const symbolBike = Number.isInteger(v.position) && symbols.length > 0 && symbols.every(group => group.some(s => s.position === v.position && s.bike));
    const hasBike = symbolBike || p.pictoProperties?.bikePicto === true || p.bikePlatform === true || Number(p.numberBikeHooks) > 0;
    if (!hasBike) continue;
    const calls = list(v.formationVehicleAtScheduledStops);
    const fromCalls = calls.map((s, i) => sameName(s.stopPoint?.name, ref.from) && sameTime(s.stopTime?.departureTime, ref.departure) ? i : -1).filter(i => i >= 0);
    const toCalls = calls.map((s, i) => sameName(s.stopPoint?.name, ref.to) && sameTime(s.stopTime?.arrivalTime, ref.arrival) ? i : -1).filter(i => i >= 0);
    const callThrough = fromCalls.length === 1 && toCalls.length === 1 && toCalls[0] > fromCalls[0];
    const from = indices(stopId(p.fromStop)), to = indices(stopId(p.toStop));
    const spanThrough = hasStops && from.length === 1 && to.length === 1 && from[0] <= board && to[0] >= alight;
    // With CUS present, vehicle boundary data must agree even if a stale vehicle call list does not.
    if (callThrough && (!hasStops || !stopId(p.fromStop) && !stopId(p.toStop) || spanThrough) || spanThrough) eligible.push(v);
  }
  // Compact data can independently prove a numbered bicycle coach runs all the way.
  const closedNumbers = new Set(list(d.formations).flatMap(f => list(f.formationVehicles)).filter(v =>
    v.vehicleProperties?.closed === true || v.vehicleProperties?.vehicleWillBePutAway === true || /^Geschlossen/.test(v.vehicleProperties?.trolleyStatus ?? "")).map(v => String(v.number)));
  const throughNumbers = symbols.length ? symbols[0].filter(s => s.bike && s.number && !closedNumbers.has(s.number) && symbols.every(group => group.some(t => t.bike && t.number === s.number))).map(s => s.number) : [];
  const goals = hasStops ? list(stops[board].formationShort?.vehicleGoals) : [];
  const throughPositions = symbols.length ? symbols[0].filter(s => s.bike && !list(d.formations).flatMap(f => list(f.formationVehicles)).some(v => v.position === s.position && (v.vehicleProperties?.closed === true || v.vehicleProperties?.vehicleWillBePutAway === true || /^Geschlossen/.test(v.vehicleProperties?.trolleyStatus ?? ""))) && goals.some(g => {
    const destination = indices(stopId(g.destinationStopPoint));
    return Number.isInteger(g.fromVehicleAtPosition) && Number.isInteger(g.toVehicleAtPosition)
      && s.position >= g.fromVehicleAtPosition && s.position <= g.toVehicleAtPosition
      && destination.length === 1 && destination[0] >= alight;
  }) && symbols.every(group => group.some(t => t.position === s.position && t.bike))).map(s => s.position) : [];
  if (!eligible.length && !throughNumbers.length && !throughPositions.length) return { ...formationResult("no-data",
    "No usable bicycle coach is confirmed for the whole section. Missing, closed or detached bicycle coaches do not establish a prohibition; service and operator rules still apply.", checked),
    observed: { symbols: stops.slice(Math.max(0, board), Math.max(0, board) + 3).map(s => String(s.formationShort?.formationShortString ?? "").slice(0,2000)),
      vehicles: list(d.formations).flatMap(f => list(f.formationVehicles)).slice(0, 3).map(v => ({ number:v.number, position:v.position, from:v.vehicleProperties?.fromStop, to:v.vehicleProperties?.toStop, closed:v.vehicleProperties?.closed, bikePicto:v.vehicleProperties?.pictoProperties?.bikePicto, hooks:v.vehicleProperties?.numberBikeHooks })) } };
  const required = symbols.some(group => {
    const choices = [...eligible.map(v => group.find(s => Number.isInteger(v.position) ? s.position === v.position : s.number && s.number === String(v.number))),
      ...throughNumbers.map(number => group.find(s => s.number === number)), ...throughPositions.map(position => group.find(s => s.position === position))];
    return choices.length > 0 && choices.every(s => s?.bike && s.reservation);
  });
  const coaches = [...new Set([...eligible.map(v => Number(v.number) > 0 ? String(v.number) : ""), ...throughNumbers].filter(Boolean))];
  const message = required ? "The formation marks bicycle spaces with R: reserve a bicycle space before boarding."
    : "A bicycle-equipped coach runs through your section. Reservation requirements are checked separately against service and operator rules.";
  const attributes = [{ code: required ? "A__VR" : "A__VH", text: message, scope: "segment" as const }];
  return { ...formationResult("matched", message, checked), coaches, rule: { permission: "allowed", basis: "service-rule",
    bikeReservation: required ? "required" : "unknown", reservationUnspecified: !required, attributes, notes: [message] } };
}
