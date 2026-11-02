import assert from "node:assert/strict";
import { it } from "node:test";
import fixture from "./fixtures/bicycle-2026-11-02.json" with { type: "json" };
import { emptyNetwork } from "./model.ts";
import { addOjpConnections, OjpClient } from "./ojpClient.ts";
import type { OjpLeg } from "./ojp.ts";
import { StationTransferClient } from "./stationTransferClient.ts";
import { handleStationTransfers } from "../server/stationTransferHandler.ts";
import { transferEndpointKey, transferEndpointQuery, staticTransfer } from "./staticTransfers.ts";
import { domesticSwissLeg } from "./transitScope.ts";
import { bicyclePermission } from "./bicyclePermission.ts";
import { carriageForLeg, interpretBicycleAttributes, withTripInfoRule } from "./bicycleCarriage.ts";
import { bicycleStatus } from "./bicycleStatus.ts";
import { operatorCode } from "./normalization.ts";
import { operatorIdentity } from "./operatorIdentity.ts";
import { DEFAULT_FARE_PROFILE } from "./fares.ts";
import { DEFAULT_BICYCLE } from "./travelProfile.ts";

const signal = new AbortController().signal;
const profile = { ...DEFAULT_FARE_PROFILE, bicycle: { ...DEFAULT_BICYCLE, lengthCm: 180 } };
const api: typeof fetch = (input, init) => handleStationTransfers(new Request(new URL(String(input), "https://app.test"), init));
function network(name: "b31" | "b21") {
  const n = emptyNetwork(), sample = fixture[name];
  // Preserve the exact raw service/section. Initial query endpoints provide
  // UIC identities only when they are the same graph stop.
  for (const s of [sample.query.from, sample.query.to]) n.stops.set(s.id, s);
  addOjpConnections(n, { legs: [sample.leg as OjpLeg], checked: sample.checked, warnings: [] });
  return n;
}
async function captured(name: "b31" | "b21") {
  const n = network(name); await new StationTransferClient(api).hydrate(n, signal);
  return [...n.edges.values()][0].leg;
}
const attr = (code: string, text = "") => ({ code, text, scope: "service" as const });

it("resolves official business identities without merging sibling tariff scopes", () => {
  for (const code of ["ojp:849", "ojp:3849", "ch:1:sboid:100648"]) assert.equal(operatorCode(code), "VBZ");
  assert.equal(operatorIdentity("ojp:146")?.businessNumber, "146");
  assert.equal(operatorCode("ojp:605"), "STI BERG");
  assert.equal(operatorCode("849"), "849", "Bare unrelated identifiers have no automatic namespace");
  assert.equal(operatorIdentity("ojp:605", "2022-01-01"), null);
  assert.equal(operatorIdentity("ojp:999999"), null);
});
it("classifies the captured B31 with no bike icon: allowed, ticket required, no reservation", async () => {
  const leg = await captured("b31");
  assert.equal(leg.ojp!.bikeFiltered, true);
  assert.ok(leg.ojp!.attributes.every(a => !a.code.startsWith("A__V")));
  const result = carriageForLeg(leg, profile);
  assert.equal(result.permission, "confirmed");
  assert.equal(result.bikeTicket, "required");
  assert.equal(result.bikeReservation, "not-required");
  assert.ok(result.nationalRule);
  assert.match(result.guidance.join(" "), /dated service conditions were checked/);
  assert.match(bicycleStatus(leg, profile).title, /Bikes allowed · No reservation required/);
  // A failed/missing conditions check cannot use absence as a reservation exemption.
  leg.bicycleEvidence!.prerequisites!.conditionsChecked = false;
  assert.equal(carriageForLeg(leg, profile).bikeReservation, "unknown");
});
it("retains Beatenbucht station identity when its platform is ambiguous without inventing transfer minutes", async () => {
  const leg = await captured("b21");
  assert.equal(leg.stationArrival?.status, "ambiguous");
  assert.equal(leg.stationArrival?.stationId, "8507178");
  assert.equal(leg.stationArrival?.stationIdentityVerified, true);
  assert.equal(domesticSwissLeg(leg), true);
  assert.equal(carriageForLeg(leg, profile).permission, "confirmed");
  assert.equal(carriageForLeg(leg, profile).bikeReservation, "not-required");
  const next = { ...leg, fromId: leg.toId, stationDeparture: leg.stationArrival };
  assert.equal(staticTransfer(leg, next).seconds, undefined);
  leg.stationArrival!.stationIdentityVerified = false;
  assert.equal(domesticSwissLeg(leg), false);
  assert.equal(carriageForLeg(leg, profile).permission, "confirmed", "Ordinary dated permission survives a platform ambiguity");
  assert.equal(carriageForLeg(leg, profile).bikeReservation, "unknown", "National reservation inference still requires Swiss scope");
});
it("does not trust contradictory, unknown or stale provider station references", async () => {
  const response = await api("/api/station-transfers/v1", { method: "POST", body: JSON.stringify({ endpoints: [
    { ref: "ch:1:sloid:3000:10:18", stopId: "8507000", serviceDate: "2026-11-03" },
    { ref: "ch:1:sloid:999999999", stopId: "8503000", serviceDate: "2026-11-03" },
    { ref: "ch:1:sloid:7178:1:4", serviceDate: "2027-01-01" },
  ] }) });
  for (const endpoint of (await response.json()).endpoints) assert.notEqual(endpoint.stationIdentityVerified, true);
  const leg = await captured("b21");
  leg.stationArrival!.key = transferEndpointKey({ ...transferEndpointQuery(leg, "arrival"), serviceDate: "2026-11-04" });
  assert.equal(domesticSwissLeg(leg), false);
});
it("keeps reservation notices, conflicts, unfamiliar codes, special bikes and exclusions stronger than T600", async () => {
  for (const [attributes, reservation] of [
    [[attr("A__VR")], "required"],
    [[attr("A__VR"), attr("I_note", "Bicycles: No reservation required")], "unknown"],
    [[attr("A__VQ")], "unknown"],
    [[attr("I_note", "Bikes: advance booking mandatory")], "unknown"],
    [[attr("I_note", "Bicycles subject to special conditions")], "unknown"],
  ] as const) {
    const leg = await captured("b31");
    leg.bicycleEvidence = withTripInfoRule(leg.bicycleEvidence!, interpretBicycleAttributes([...attributes]), fixture.b31.checked);
    assert.equal(carriageForLeg(leg, profile).bikeReservation, reservation);
  }
  const banned = await captured("b31");
  banned.bicycleEvidence = withTripInfoRule(banned.bicycleEvidence!, interpretBicycleAttributes([attr("A__VN")]), fixture.b31.checked);
  assert.equal(carriageForLeg(banned, profile).permission, "prohibited");
  for (const change of [{operator:"ojp:605"}, {operator:"ojp:999999"}, {category:"SEV"}, {serviceName:"Replacement bus"}, {category:"FUNICULAR"}, {toId:"8000001"}]) {
    const leg = Object.assign(await captured("b21"), change);
    leg.bicycleEvidence = { ...leg.bicycleEvidence!, operator:leg.operator, toId:leg.toId! };
    assert.equal(carriageForLeg(leg, profile).bikeReservation, "unknown");
  }
  const leg = await captured("b21");
  assert.equal(carriageForLeg(leg, { ...profile, bicycle:{...profile.bicycle, kind:"cargo",lengthCm:null} }).bikeReservation,"unknown");
  leg.departure = new Date("2026-12-13T08:00:00Z"); leg.arrival = new Date("2026-12-13T08:20:00Z");
  leg.bicycleEvidence!.departure = leg.departure.toISOString();
  assert.equal(carriageForLeg(leg,profile).bikeReservation,"unknown");
});
it("membership alone cannot establish permission, while explicit ordinary-bike permission survives a foreign section", async () => {
  const leg = await captured("b21");
  leg.bicycleEvidence!.permission = "unknown";
  assert.equal(carriageForLeg(leg,profile).permission,"uncertain");
  assert.equal(carriageForLeg(leg,profile).bikeReservation,"unknown");
  leg.bicycleEvidence!.permission = "allowed";leg.toId="8000001";leg.bicycleEvidence!.toId=leg.toId;
  assert.equal(bicyclePermission(leg,profile),"confirmed");
  const electric = {...profile,bicycle:{...profile.bicycle,drive:"assist25" as const}};
  assert.equal(bicyclePermission(leg,electric),"uncertain");
  assert.match(bicycleStatus(leg,electric).explanation,/bicycle-type rules/);
  const abf = Object.assign(await captured("b21"), {operator:"ojp:755"});
  abf.bicycleEvidence!.operator = abf.operator;
  assert.equal(carriageForLeg(abf,profile).permission,"prohibited", "Membership yes cannot bypass the ZVV operator ban");
});
it("investigates unresolved exact sections once within a two-call budget and preserves unknown on failed checks", async () => {
  const n = network("b21"), original = [...n.edges.values()][0];
  for (let i=0;i<3;i++) {
    const leg = structuredClone(original.leg);
    leg.ojp!.journeyRef += i;leg.bicycleEvidence!.permission="unknown";
    n.edges.set(String(i),{...original,id:String(i),leg});
  }
  n.edges.delete(original.id);
  let calls=0,claims=0;
  const client = new OjpClient(signal, async (_url, init) => {
    calls++;assert.ok(JSON.parse(String(init!.body)).fromRef);
    if(calls===2) throw new Error("offline");
    return Response.json({rule:interpretBicycleAttributes([attr("A__VH")]),checked:fixture.b21.checked});
  });
  const claim = (count:number) => {claims+=count;return true;};
  await client.investigateBicycles(n,claim);await client.investigateBicycles(n,claim);
  assert.equal(calls,2);assert.equal(claims,2);
  assert.equal(bicyclePermission(n.edges.get("0")!.leg),"confirmed");
  assert.equal(bicyclePermission(n.edges.get("1")!.leg),"uncertain");
  assert.equal(bicyclePermission(n.edges.get("2")!.leg),"uncertain");
  assert.match([...client.warnings].join(" "),/unavailable/);
  const noBudget = new OjpClient(signal,async()=>{throw new Error("Must not fetch");});
  await noBudget.investigateBicycles(n,()=>false);
});
