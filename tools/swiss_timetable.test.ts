import assert from "node:assert/strict";
import { it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SwissTimetable, serviceBase } from "./swiss_timetable.ts";

function fixture(run: (t: SwissTimetable, db: DatabaseSync) => void) {
  const dir = mkdtempSync(join(tmpdir(), "swiss-timetable-")), path = join(dir, "test.sqlite"), db = new DatabaseSync(path);
  db.exec(`CREATE TABLE metadata(key TEXT,value TEXT); CREATE TABLE stops(id TEXT,name TEXT,lat REAL,lon REAL,parent TEXT,platform TEXT,uic TEXT);
    CREATE TABLE agencies(id TEXT,timezone TEXT); CREATE TABLE routes(id TEXT,agency TEXT,name TEXT,category TEXT);
    CREATE TABLE service_dates(service TEXT,date TEXT); CREATE TABLE trips(id TEXT,route TEXT,service TEXT,headsign TEXT,number TEXT,hints TEXT);
    CREATE TABLE stop_times(trip TEXT,seq INTEGER,stop TEXT,arrival INTEGER,departure INTEGER,pickup INTEGER,dropoff INTEGER);
    CREATE TABLE frequencies(trip TEXT); CREATE TABLE transfers(from_stop TEXT,to_stop TEXT,type INTEGER,seconds INTEGER);
    INSERT INTO agencies VALUES('99','Europe/Zurich'); INSERT INTO routes VALUES('r','99','R1','R');
    INSERT INTO service_dates VALUES('day','2026-09-25'); INSERT INTO service_dates VALUES('night','2026-09-24');
    INSERT INTO stops VALUES('A','A',47,8,'','1','8500001'),('B','B',47.1,8.1,'','2','8500002'),('C','C',47.05,8.05,'','3','8500003');`);
  db.prepare("INSERT INTO metadata VALUES ('report',?)").run(JSON.stringify({ indexed_dates: ["2026-09-24", "2026-09-25"], imported_at: "2026-09-25T06:00:00Z", warnings: [], counts: { frequencies: 1 } }));
  let t: SwissTimetable | undefined;
  try { t = new SwissTimetable(path); run(t, db); } finally { t?.close(); db.close(); rmSync(dir, { recursive: true }); }
}
function trip(db: DatabaseSync, id: string, hints: string, departure: number, arrival: number, options: { pickup?: number; dropoff?: number; to?: string; from?: string; service?: string } = {}) {
  db.prepare("INSERT INTO trips VALUES (?, 'r',?,'Destination',?,?)").run(id, options.service ?? "day", id, hints);
  const insert = db.prepare("INSERT INTO stop_times VALUES (?,?,?,?,?,?,?)");
  insert.run(id, 1, options.from ?? "A", departure, departure, options.pickup ?? 0, 0);
  insert.run(id, 2, options.to ?? "B", arrival, arrival, 0, options.dropoff ?? 0);
}
const query = { from: "8500001", to: "8500002", departure: "2026-09-25T08:00:00+02:00", maxBoardings: 2, horizonMinutes: 120 };

it("keeps later verified services when earlier prohibited and unknown services would otherwise dominate", () => fixture((t, db) => {
  trip(db, "ban", "VN", 8 * 3600 + 60, 8 * 3600 + 600);
  trip(db, "unknown", "", 8 * 3600 + 120, 8 * 3600 + 1200);
  trip(db, "allowed", "VR", 8 * 3600 + 180, 8 * 3600 + 1800);
  const result = t.query(query);
  for (const [scope, time] of [["confirmed", "06:30"], ["allow-uncertain", "06:20"], ["all-transit", "06:10"]]) {
    assert.equal(result.journeys.filter(j => j.scope === scope).at(-1)!.arrival.slice(11, 16), time);
  }
  assert.equal(result.incomplete, false);
}));
it("respects pickup, drop-off and frequency restrictions rather than promising an exact unavailable trip", () => fixture((t, db) => {
  trip(db, "no-pickup", "VR", 28860, 29000, { pickup: 1 });
  trip(db, "no-dropoff", "VR", 28860, 29000, { dropoff: 1 });
  trip(db, "frequency", "VR", 28860, 29000); db.exec("INSERT INTO frequencies VALUES('frequency')");
  trip(db, "valid", "VR", 29000, 30000);
  const r = t.query({ ...query, scope: "confirmed" });
  assert.equal(r.journeys.at(-1)!.sections[0].journey!.name, "valid");
  assert.ok(r.warnings.some(w => w.includes("Frequency")));
}));
it("preserves fewer-boardings and faster-transfer alternatives and honours forbidden transfers", () => fixture((t, db) => {
  trip(db, "direct", "VR", 29000, 32400);
  trip(db, "part1", "VR", 29000, 29400, { to: "C" });
  trip(db, "part2", "VR", 30000, 30600, { from: "C" });
  let r = t.query({ ...query, scope: "confirmed" });
  assert.deepEqual(r.journeys.map(j => j.boardings), [1, 2]);
  db.exec("INSERT INTO transfers VALUES('C','C',3,0)");
  r = t.query({ ...query, scope: "confirmed" });
  assert.deepEqual(r.journeys.map(j => j.boardings), [1]);
}));
it("keeps the previous service day's 25:00 departure and rejects dates outside the import", () => fixture((t, db) => {
  trip(db, "overnight", "VR", 90000, 91200, { service: "night" });
  const r = t.query({ ...query, departure: "2026-09-25T00:50:00+02:00", scope: "confirmed" });
  assert.equal(r.journeys[0].sections[0].departure!.departure, "2026-09-24T23:00:00.000Z");
  assert.throws(() => t.query({ ...query, departure: "2026-10-01T08:00:00Z" }), /outside/);
}));
it("uses GTFS noon-minus-twelve service bases across daylight-saving changes", () => {
  assert.equal(new Date(serviceBase("2026-03-29")).toISOString(), "2026-03-28T22:00:00.000Z");
  assert.equal(new Date(serviceBase("2026-10-25")).toISOString(), "2026-10-24T23:00:00.000Z");
});
