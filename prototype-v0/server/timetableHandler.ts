// Optional server-to-server bridge. The national pilot is never enabled by a
// browser URL, bundled secret or an automatic hosting purchase.
export type TimetableEnvironment = { SWISS_TIMETABLE_URL?: string; SWISS_TIMETABLE_TOKEN?: string };
export async function handleTimetable(request: Request, env: TimetableEnvironment, fetcher: typeof fetch = fetch) {
  const path = new URL(request.url).pathname;
  if (path === "/api/timetable/status") return Response.json({ available: !!env.SWISS_TIMETABLE_URL, pilot: true }, { headers: { "Cache-Control": "no-store" } });
  if (path !== "/api/timetable/connections" || request.method !== "POST") return new Response("Not found", { status: 404 });
  if (!env.SWISS_TIMETABLE_URL) return Response.json({ error: "Local timetable is not configured" }, { status: 503 });
  try {
    const base = new URL(env.SWISS_TIMETABLE_URL);
    if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) throw new Error("Invalid service URL");
    const text = await request.text();
    if (text.length > 4096) return new Response("Request too large", { status: 413 });
    const data = JSON.parse(text);
    if (![data.from, data.to].every(v => typeof v === "string" && v.length > 0 && v.length <= 160)
      || typeof data.departure !== "string" || !Number.isFinite(Date.parse(data.departure))) return new Response("Invalid query", { status: 400 });
    const upstream = await fetcher(new URL("/connections", base), { method: "POST", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
      headers: { "Content-Type": "application/json", ...(env.SWISS_TIMETABLE_TOKEN ? { Authorization: "Bearer " + env.SWISS_TIMETABLE_TOKEN } : {}) },
      body: JSON.stringify({ from: data.from, to: data.to, departure: data.departure, maxBoardings: 4, horizonMinutes: 720 }) });
    if (!upstream.ok) throw new Error("Timetable unavailable");
    const result = await upstream.json();
    if (!Array.isArray(result.journeys) || !Array.isArray(result.warnings)) throw new Error("Invalid timetable response");
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "The local timetable could not complete this query. Use the live timetable fallback." }, { status: 503 }); }
}
