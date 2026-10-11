import bundled from "./data/station-transfers.json" with { type: "json" };
import type { TransferFeed } from "../src/staticTransfers.ts";

export type TransferData = { feed: TransferFeed; stops: [string, string, string, number, string, string][]; rules: [number, number, number][] };
type Entry = { file: string; sha256: string; bytes: number; validFrom: string; validThrough: string; edition: string };
const ROOT = "https://raw.githubusercontent.com/Victorpolm/bike-train-planner/main/data/transfers/";
const validDay = (day: unknown): day is string => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().startsWith(day);
async function boundedText(response: Response, maximum: number) {
  if (!response.ok || Number(response.headers.get("content-length")) > maximum || !response.body) throw new Error("Transfer data unavailable");
  const reader = response.body.getReader(), decoder = new TextDecoder(); let bytes = 0, text = "";
  try { for (;;) { const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength; if (bytes > maximum) throw new Error("Transfer data exceeds size limit"); text += decoder.decode(value, { stream: true });
  } } finally { await reader.cancel().catch(() => {}); }
  return text + decoder.decode();
}
export async function decodeTransferData(packed: { feed: TransferFeed; gzip: string }): Promise<TransferData> {
  if (typeof packed?.gzip !== "string" || packed.gzip.length > 5_000_000) throw new Error("Invalid transfer payload");
  const compressed = Uint8Array.from(atob(packed.gzip), c => c.charCodeAt(0));
  const raw = await boundedText(new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"))), 24_000_000);
  const data = JSON.parse(raw) as TransferData, feed = data.feed;
  if (!feed || JSON.stringify(feed) !== JSON.stringify(packed.feed) || !validDay(feed.validFrom) || !validDay(feed.validThrough)
    || feed.validThrough < feed.validFrom || !/^[a-f0-9]{64}$/.test(feed.zipSha256) || typeof feed.version !== "string"
    || feed.source !== "https://opentransportdata.swiss/en/cookbook/timetable-cookbook/gtfs/"
    || !Array.isArray(data.stops) || data.stops.length > 180_000 || !Array.isArray(data.rules) || data.rules.length > 600_000
    || data.rules.length !== feed.generalRules) throw new Error("Invalid transfer feed");
  const ids = new Set<string>();
  for (const stop of data.stops) {
    if (!Array.isArray(stop) || stop.length !== 6 || [0,1,2,4,5].some(i => typeof stop[i] !== "string" || String(stop[i]).length > 200)
      || !stop[0] || ids.has(stop[0]) || !Number.isInteger(stop[3]) || stop[3] < -1 || stop[3] >= data.stops.length)
      throw new Error("Invalid transfer stop");
    ids.add(stop[0]);
  }
  for (const rule of data.rules) if (!Array.isArray(rule) || rule.length !== 3 || rule.some(v => !Number.isInteger(v) || v < 0)
    || rule[0] >= data.stops.length || rule[1] >= data.stops.length || rule[2] > 86400) throw new Error("Invalid transfer minimum");
  return data;
}
let baseline: Promise<TransferData> | undefined;
export const bundledTransferData = () => baseline ??= decodeTransferData(bundled).catch(error => { baseline = undefined; throw error; });
export function createTransferFeedLoader(fetcher: typeof fetch = fetch, now = Date.now) {
  let manifest: Entry[] = [], expires = 0, updating: Promise<void> | undefined;
  const editions = new Map<string, Promise<TransferData>>();
  const refresh = () => updating ??= (async () => {
    try {
      const response = await fetcher(ROOT + "index.json", { redirect: "manual", signal: AbortSignal.timeout(6000) });
      const data = JSON.parse(await boundedText(response, 32_000));
      if (data.version !== 1 || !Array.isArray(data.feeds) || data.feeds.length > 6 || data.feeds.some((e: Entry) =>
        !/^\d{8}$/.test(e.edition) || !/^\d{4}-\d{8}\.json$/.test(e.file) || !/^[a-f0-9]{64}$/.test(e.sha256) || !Number.isInteger(e.bytes) || e.bytes <= 0 || e.bytes > 5_000_000
        || !validDay(e.validFrom) || !validDay(e.validThrough) || e.validThrough < e.validFrom)) throw new Error("Invalid transfer manifest");
      manifest = data.feeds; expires = now() + 6 * 3_600_000;
    } catch { expires = now() + 15 * 60_000; }
  })().finally(() => { updating = undefined; });
  return async (day?: string, waitUntil?: (work: Promise<unknown>) => void): Promise<TransferData> => {
    const base = await bundledTransferData();
    const covered = !day || day >= base.feed.validFrom && day <= base.feed.validThrough;
    if (now() >= expires) {
      if (covered && waitUntil) waitUntil(refresh()); else await refresh();
    }
    if (!day) return base;
    const entry = manifest.filter(e => !day || e.validFrom <= day && e.validThrough >= day).sort((a,b) => b.edition.localeCompare(a.edition))[0];
    if (!entry || entry.edition <= base.feed.version && covered) return base;
    let pending = editions.get(entry.sha256);
    if (!pending) {
      // At most two compact annual editions are retained in an isolate.
      if (editions.size >= 2) editions.delete(editions.keys().next().value!);
      pending = (async () => {
        const response = await fetcher(ROOT + entry.file, { redirect: "manual", signal: AbortSignal.timeout(8000) });
        const raw = await boundedText(response, entry.bytes);
        const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
        if (Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,"0")).join("") !== entry.sha256) throw new Error("Transfer checksum mismatch");
        const data = await decodeTransferData(JSON.parse(raw));
        if (data.feed.validFrom !== entry.validFrom || data.feed.validThrough !== entry.validThrough || data.feed.version !== entry.edition) throw new Error("Transfer edition mismatch");
        return data;
      })().catch(error => { editions.delete(entry.sha256); throw error; });
      editions.set(entry.sha256, pending);
    }
    try { return await pending; } catch { return base; }
  };
}
