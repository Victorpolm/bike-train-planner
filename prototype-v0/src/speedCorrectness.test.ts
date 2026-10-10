import assert from "node:assert/strict";
import { it } from "node:test";
import { carriageForLeg, evaluateCarriageForLeg } from "./bicycleCarriage.ts";
import { operatorBicycleRule, sbbIcReservation } from "./operatorBicycleRules.ts";
import { staticTransfer, transferEndpointKey, transferEndpointQuery, type TransferFeed } from "./staticTransfers.ts";
import { transferContextKey } from "./transferTimes.ts";
import type { TransitLeg } from "./routing.ts";
import type { BicycleEvidence } from "./bicyclePermission.ts";

const leg = (): TransitLeg => ({ mode: "transit", category: "IR", operator: "SBB", from: "Zürich HB", to: "Winterthur",
  fromId: "8503000", toId: "8506000", service: "IR 1", serviceName: null, direction: null,
  departure: new Date("2026-10-01T08:30:00+02:00"), arrival: new Date("2026-10-01T08:50:00+02:00"),
  departurePlatform: "3", arrivalPlatform: "2" });
const proof = (l: TransitLeg): BicycleEvidence => ({ permission: "allowed", fromId: l.fromId!, toId: l.toId!,
  departure: l.departure!.toISOString(), service: l.service, operator: l.operator!, conditions: [],
  source: { title: "Synthetic evidence", url: "https://example.org/rule", checked: "2026-09-30" },
  prerequisites: { bikeTicket: "required", bikeReservation: "required" } });

it("preserves the v1 transfer-key wire format for escapes, Unicode and changed platforms", () => {
  const values = ["", "8503000", "ch:1:sloid:3000:3", "1/2", "a\u0000b", 'a"b', "a\\b", "\n", "é🚲", "\ud800", "\udfff"];
  for (const ref of values) for (const stopId of values) for (const platform of values) for (const platformChanged of [undefined, false, true]) {
    const query = { ref, stopId, platform, platformChanged };
    assert.equal(transferEndpointKey(query), JSON.stringify([ref, stopId, platform, ...(platformChanged ? [true] : [])]));
  }
  assert.equal(transferEndpointKey({ ref: "8503000" }), '["8503000","",""]');
});

it("keeps transfer contexts distinct even when provider names contain key separators", () => {
  const seen = new Map<string, string>();
  for (const service of ["", "A", "A\u0000B", "A|B", "4:test", "-", "🚲"]) {
    for (const operator of [undefined, null, "", "B", "B\u0000C", "B|C", "5:train"]) {
      for (const arrivalPlatform of [null, "", "2", "2\u0000X"]) {
        const l = { ...leg(), service, operator, arrivalPlatform };
        const key = transferContextKey([l]), semantic = JSON.stringify([service, operator ?? null, arrivalPlatform]);
        assert.ok(!seen.has(key) || seen.get(key) === semantic, `${key} merged distinct contexts`);
        seen.set(key, semantic);
      }
    }
  }
  assert.notEqual(transferContextKey([{ ...leg(), service: "A\u0000B", operator: "C" }]),
    transferContextKey([{ ...leg(), service: "A", operator: "B\u0000C" }]));
});

it("changes transfer identity on realtime arrival/platform updates and resets it after cycling", () => {
  const l = leg(), original = transferContextKey([l]);
  l.arrival!.setTime(+l.arrival! + 1000);
  assert.notEqual(transferContextKey([l]), original);
  const changed = transferContextKey([l]); l.arrivalPlatform = "4";
  assert.notEqual(transferContextKey([l]), changed);
  const cycle = { ...l, mode: "bike" as const, departure: new Date(+l.arrival!), arrival: new Date(+l.arrival! + 60_000) };
  assert.equal(transferContextKey([l, cycle]), "access");
  assert.equal(transferContextKey([l, { ...cycle, mode: "walk" }]), transferContextKey([l]));
});

it("matches uncached carriage evaluation across 1,024 operator, service and evidence combinations", () => {
  for (const operator of ["SBB", "SOB", "BLS", "RHB", "VBZ", "TPG", "ABF", "Unknown"]) {
    for (const category of ["IR", "IC", "S", "RE", "B", "TRAM", "SEV", "BOAT"]) {
      for (const permission of [undefined, "allowed", "unknown", "prohibited"] as const) {
        for (const reservation of [undefined, "required", "not-required", "unknown"] as const) {
          const l = { ...leg(), operator, category };
          if (permission) l.bicycleEvidence = { ...proof(l), permission };
          if (reservation && l.bicycleEvidence) l.bicycleEvidence.prerequisites!.bikeReservation = reservation;
          assert.deepEqual(carriageForLeg(l), evaluateCarriageForLeg(l));
          assert.deepEqual(carriageForLeg(l), evaluateCarriageForLeg(l));
        }
      }
    }
  }
});

it("invalidates cached carriage after every nested requirement, condition, source and service mutation", () => {
  const l = leg(); l.bicycleEvidence = proof(l);
  const check = () => assert.deepEqual(carriageForLeg(l), evaluateCarriageForLeg(l));
  check();
  const requirements = l.bicycleEvidence.prerequisites!;
  requirements.bikeReservation = "not-required"; check();
  requirements.bikeReservation = "unknown"; check();
  requirements.bikeTicket = "not-required"; check();
  requirements.ticketSource = { title: "Ticket source", url: "https://example.org/ticket", checked: "2026-10-01" }; check();
  requirements.ticketSource.url = "https://example.org/new-ticket"; check();
  assert.equal(carriageForLeg(l).bookingUrl, requirements.ticketSource.url);
  requirements.ticketSource.title = "New title"; check();
  requirements.ticketSource.checked = "2026-10-02"; check();
  requirements.bookingUrl = "https://example.org/book"; check();
  delete requirements.bookingUrl; check();
  l.bicycleEvidence.conditions.push("The provider gives conflicting reservation conditions."); check();
  l.bicycleEvidence.permission = "prohibited"; check();
  l.bicycleEvidence.source.url = "http://invalid.example"; check();
  l.bicycleEvidence.source.url = "https://example.org/rule"; check();
  l.bicycleEvidence = structuredClone(l.bicycleEvidence); check();
  assert.equal(carriageForLeg(l).evidence, l.bicycleEvidence);
  l.departure!.setTime(+l.departure! + 60_000); check();
  l.bicycleEvidence.departure = l.departure!.toISOString(); check();
  l.operator = "Unknown"; check(); l.category = "B"; check();
  delete l.bicycleEvidence; check();
});

const dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });
const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", hourCycle: "h23", weekday: "short" });
const feed: TransferFeed = { version: "synthetic", validFrom: "2025-01-01", validThrough: "2026-12-31",
  zipSha256: "synthetic", source: "https://example.org/feed", generalRules: 1, excludedScopedRows: 0 };
function checkedTransfer(time: number, expectedDay: string) {
  const incoming = leg(), next = leg(), edition = { ...feed, validFrom: expectedDay, validThrough: expectedDay };
  incoming.arrival = new Date(time); next.departure = new Date(time);
  incoming.stationArrival = { key: transferEndpointKey(transferEndpointQuery(incoming, "arrival")), status: "matched", id: "in", minimums: { out: 300 }, feed: edition };
  next.stationDeparture = { key: transferEndpointKey(transferEndpointQuery(next, "departure")), status: "matched", id: "out", feed: edition };
  return staticTransfer(incoming, next);
}

it("checks 35,040 Swiss local instants across two years, DST, midnight and cache eviction", () => {
  let checks = 0;
  for (let time = Date.parse("2025-01-01T00:00:00Z"); time < Date.parse("2027-01-01T00:00:00Z"); time += 3_600_000) {
    for (const offset of [0, 3_599_999]) {
      const instant = time + offset, date = new Date(instant), day = dateFormat.format(date);
      assert.equal(checkedTransfer(instant, day).seconds, 300, date.toISOString());
      const parts = hourFormat.formatToParts(date), hour = Number(parts.find(p => p.type === "hour")!.value);
      const weekday = !["Sat", "Sun"].includes(parts.find(p => p.type === "weekday")!.value);
      const regional = { ...leg(), departure: date, arrival: date, category: "S" };
      assert.equal(operatorBicycleRule(regional)?.permission, weekday && (hour >= 6 && hour < 8 || hour >= 16 && hour < 19) ? "unknown" : "allowed");
      const md = Number(day.slice(5).replace("-", ""));
      assert.equal(sbbIcReservation({ ...regional, category: "IC", service: "IC2" }), md >= 321 && md <= 1031 ? "required" : "not-required");
      checks++;
    }
  }
  assert.equal(checks, 35_040);
});

it("preserves pre-epoch sub-hour timezones and explicit operating days", () => {
  for (const timestamp of ["1850-01-01T23:20:00Z", "1850-01-01T23:50:00Z", "1890-01-01T23:20:00Z", "1890-01-01T23:50:00Z"])
    assert.equal(checkedTransfer(Date.parse(timestamp), dateFormat.format(new Date(timestamp))).seconds, 300);
  const incoming = leg(), next = leg();
  incoming.ojp = { journeyRef: "in", operatingDay: "2026-12-12", fromRef: incoming.fromId!, toRef: incoming.toId!,
    fromOrder: 1, toOrder: 2, departure: incoming.departure!.toISOString(), arrival: incoming.arrival!.toISOString(), bikeFiltered: false, attributes: [] };
  next.ojp = { ...incoming.ojp, journeyRef: "out", fromRef: next.fromId!, toRef: next.toId! };
  const edition = { ...feed, validFrom: "2026-12-12", validThrough: "2026-12-12" };
  incoming.stationArrival = { key: transferEndpointKey(transferEndpointQuery(incoming, "arrival")), status: "matched", id: "in", minimums: { out: 300 }, feed: edition };
  next.stationDeparture = { key: transferEndpointKey(transferEndpointQuery(next, "departure")), status: "matched", id: "out", feed: edition };
  assert.equal(staticTransfer(incoming, next).seconds, 300, "explicit service day takes precedence over the civil date");
});
