import { parseBikeParking, PARKING_DOWNLOAD, type ParkingData } from "../src/bikeParking.ts";
let cached: ParkingData | null = null;
let pending: Promise<ParkingData> | null = null;
const TTL = 24 * 60 * 60_000;
async function download(fetcher: typeof fetch) {
  const response = await fetcher(PARKING_DOWNLOAD, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Parking source unavailable");
  const data = parseBikeParking(await response.json());
  if (!data.facilities.length) throw new Error("Parking data empty");
  cached = data; return data;
}
export async function handleParking(request: Request, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  try {
    if (!cached || Date.now() - Date.parse(cached.fetchedAt) > TTL) {
      pending ??= download(fetcher).finally(() => { pending = null; });
      try { await pending; } catch (error) { if (!cached) throw error; }
    }
    return Response.json({ ...cached, stale: Date.now() - Date.parse(cached!.fetchedAt) > TTL },
      { headers: { "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "Bicycle parking could not be loaded. Your journey search is unaffected." }, { status: 503 }); }
}
