import assert from "node:assert/strict";
import { it } from "node:test";
import { handleTimetable } from "../server/timetableHandler.ts";
import { NationalTimetableClient } from "./nationalTimetableClient.ts";
import { emptyNetwork } from "./model.ts";
import { bicyclePermission } from "./bicyclePermission.ts";

const request = () => new Request("https://private.example/api/timetable/connections", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ from: "8503000", to: "8503504", departure: "2026-09-25T08:00:00Z" }) });
it("keeps the national service disabled without configuration and secrets out of the browser response", async () => {
  const status = await handleTimetable(new Request("https://private.example/api/timetable/status"), {});
  assert.equal((await status.json()).available, false);
  assert.equal((await handleTimetable(request(), {})).status, 503);
  const response = await handleTimetable(request(), { SWISS_TIMETABLE_URL: "https://private-index.example", SWISS_TIMETABLE_TOKEN: "test-server-secret" }, async (url, init) => {
    assert.equal(String(url), "https://private-index.example/connections");
    assert.equal(new Headers(init!.headers).get("Authorization"), "Bearer test-server-secret");
    assert.equal(init!.redirect, "error");
    return Response.json({ journeys: [], warnings: [] });
  });
  assert.equal(response.status, 200); assert.ok(!(await response.text()).includes("test-server-secret"));
  const bad = await handleTimetable(request(), { SWISS_TIMETABLE_URL: "http://public.example" }, async () => { throw new Error("must not fetch"); });
  assert.equal(bad.status, 503);
});
it("preserves useful GTFS bicycle evidence even when the national pilot reports an incomplete search", async () => {
  const network = emptyNetwork(), from = { id: "8503000", name: "Zürich HB", lat: 47.378, lon: 8.54 }, to = { id: "8503504", name: "Baden", lat: 47.476, lon: 8.308 };
  const client = new NationalTimetableClient(new AbortController().signal, async () => Response.json({ checked: "2026-09-25", incomplete: true, warnings: ["Incomplete pilot"], journeys: [{ sections: [{
    departure: { station: { id: from.id, name: from.name, coordinate: { x: from.lat, y: from.lon } }, departure: "2026-09-25T08:10:00Z" },
    arrival: { station: { id: to.id, name: to.name, coordinate: { x: to.lat, y: to.lon } }, arrival: "2026-09-25T08:30:00Z" },
    journey: { category: "IR", number: "35", operator: "OJP:11", bicycleData: { source: { title: "Swiss GTFS", url: "https://opentransportdata.swiss", checked: "2026-09-25" }, attributes: [{ code: "A__VR", text: "VR", scope: "service" }] } },
  }] }] }));
  assert.equal(await client.add(network, from, to, new Date("2026-09-25T08:00:00Z")), false);
  assert.ok(network.edges.size > 0); assert.equal(bicyclePermission([...network.edges.values()][0].leg), "confirmed");
  assert.ok(client.warnings.has("Incomplete pilot"));
});
