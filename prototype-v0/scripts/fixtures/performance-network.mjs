import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const platformIndexes = new Map();
function platformsFor(root) {
  if (platformIndexes.has(root)) return platformIndexes.get(root);
  const packed = JSON.parse(readFileSync(resolve(root, "server/data/station-transfers.json"), "utf8"));
  const data = JSON.parse(gunzipSync(Buffer.from(packed.gzip, "base64")).toString());
  const platforms = new Map();
  for (const row of data.stops) if (row[2] && row[4] && row[5] !== "1") {
    const set = platforms.get(row[2]) ?? new Set(); set.add(row[4]); platforms.set(row[2], set);
  }
  platformIndexes.set(root, platforms);
  return platforms;
}

export async function performanceNetwork(root, size = 36, hydrated = true, seed = 1, repetitions = 18) {
  const load = path => import(pathToFileURL(resolve(root, path)).href);
  const model = await load("src/model.ts"), { MAJOR_STATIONS } = await load("src/majorStations.ts");
  const { StationTransferClient } = await load("src/stationTransferClient.ts");
  const { handleStationTransfers } = await load("server/stationTransferHandler.ts");
  const platforms = platformsFor(root);
  const stops = MAJOR_STATIONS.filter(s => platforms.has(s.id)).slice(0, size).map((s, i) => ({
    id: s.id, name: `Synthetic station ${i}`, lat: 47.36 + (i % 2) * .001, lon: 8.3 + i * .008,
  }));
  if (stops.length !== size) throw new Error("Not enough indexed stations for requested fixture size");
  const network = model.emptyNetwork(); stops.forEach(s => network.stops.set(s.id, s));
  const start = new Date("2026-10-10T06:30:00Z");
  for (let from = 0; from < size; from++) for (const jump of [1, 2, 4, 8, 12]) {
    const to = from + jump; if (to >= size) continue;
    for (let repetition = 0; repetition < repetitions; repetition++) {
      const a = stops[from], b = stops[to], id = `${from}-${to}-${repetition}`;
      const minute = repetition * 8 + (from * 3 + seed) % 8;
      const departure = new Date(+start + minute * 60_000), arrival = new Date(+departure + (5 + jump * 2) * 60_000);
      const category = jump >= 8 ? "IC" : jump >= 4 ? "IR" : "S", service = category === "IC" ? "IC1" : `${category}${jump}`;
      const aPlatforms = [...platforms.get(a.id)], bPlatforms = [...platforms.get(b.id)];
      network.edges.set(id, { id, from: a.id, to: b.id, leg: { mode: "transit", from: a.name, to: b.name,
        fromId: a.id, toId: b.id, fromPoint: a, toPoint: b, departure, arrival, operator: "SBB", category, service,
        serviceName: `Synthetic ${id}`, direction: null,
        departurePlatform: aPlatforms[(repetition + seed) % Math.min(2, aPlatforms.length)],
        arrivalPlatform: bPlatforms[(repetition + jump) % Math.min(2, bPlatforms.length)] } });
    }
  }
  if (hydrated) {
    const client = new StationTransferClient((_url, init) => handleStationTransfers(new Request("https://fixture.example/api/station-transfers/v1", init)));
    await client.hydrate(network, new AbortController().signal);
    if (client.warnings.size) throw new Error([...client.warnings].join("; "));
  }
  const origin = { label: "Synthetic origin", lat: stops[0].lat, lon: stops[0].lon - .003 };
  const last = stops.at(-1), destination = { label: "Synthetic destination", lat: last.lat, lon: last.lon + .003 };
  const options = { ...model.DEFAULT_OPTIONS, maxAccessMinutes: 8, maxEgressMinutes: 8, maxBikeMinutes: 40,
    maxIntermediateMinutes: 8, maxBoardings: 4, horizonMinutes: 180,
    objectives: ["fastest", "fewer-boardings", "least-cycling", "fewer-reservations"] };
  return { model, network, origin, destination, start, options };
}
