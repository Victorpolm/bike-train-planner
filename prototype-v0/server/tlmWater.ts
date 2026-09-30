import type { Amenity } from "../src/osmAmenities.ts";
import { validSwissPoint } from "../src/facilitySources.ts";

// Reviewed official February 2026 release. Fetch only EO members with HTTP ranges,
// never the 3.6 GB national archive. Edition upgrades require a schema review.
export const TLM_WATER_ARCHIVE = "https://data.geo.admin.ch/ch.swisstopo.swisstlm3d/swisstlm3d_2026-02/swisstlm3d_2026-02_2056_5728.shp.zip";
const TLM_PAGE = "https://www.swisstopo.admin.ch/en/landscape-model-swisstlm3d";
const MAX_COMPRESSED = 2 * 1024 * 1024, MAX_EXPANDED = 16 * 1024 * 1024;
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const decoder = new TextDecoder("utf-8");

export async function readBounded(response: Response, max: number): Promise<Uint8Array> {
  if (!response.ok || !response.body || Number(response.headers.get("Content-Length")) > max) { await response.body?.cancel(); throw new Error("Source unavailable or oversized"); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
      if (size > max) { await reader.cancel(); throw new Error("Source exceeds response limit"); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
type ZipMember = { name: string; size: number; compressed: number; method: number; offset: number; crc: number };
export function zipDirectory(bytes: Uint8Array): ZipMember[] {
  const d = view(bytes), files: ZipMember[] = []; let i = 0;
  while (i < bytes.length) {
    if (i + 46 > bytes.length || d.getUint32(i, true) !== 0x02014b50) throw new Error("Invalid ZIP directory");
    const n = d.getUint16(i + 28, true), e = d.getUint16(i + 30, true), c = d.getUint16(i + 32, true);
    if (i + 46 + n + e + c > bytes.length) throw new Error("Truncated ZIP directory");
    const name = decoder.decode(bytes.subarray(i + 46, i + 46 + n));
    if (/TLM_EINZELOBJEKT\.(dbf|shp)$/i.test(name)) {
      const f = { name, method: d.getUint16(i + 10, true), crc: d.getUint32(i + 16, true), compressed: d.getUint32(i + 20, true),
        size: d.getUint32(i + 24, true), offset: d.getUint32(i + 42, true) };
      if (d.getUint16(i + 8, true) & 1 || ![0, 8].includes(f.method) || f.compressed > MAX_COMPRESSED || f.size > MAX_EXPANDED || f.offset === 0xffffffff) throw new Error("Unsupported EO archive member");
      files.push(f);
    }
    i += 46 + n + e + c;
  }
  if (files.length !== 2 || !files.some(f => f.name.endsWith(".dbf")) || !files.some(f => f.name.endsWith(".shp"))) throw new Error("EO files missing");
  return files;
}
function crc32(bytes: Uint8Array) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let n = i; for (let j = 0; j < 8; j++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; table[i] = n; }
  let crc = 0xffffffff; for (const b of bytes) crc = table[(crc ^ b) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}

// Swisstopo's approximate LV95 -> WGS84 formula (metre-scale conversion).
// Decimal digits are not an accuracy claim or a surveyed entrance.
export function lv95ToWgs84(east: number, north: number) {
  const y = (east - 2600000) / 1000000, x = (north - 1200000) / 1000000;
  return { lat: (16.9023892 + 3.238272 * x - .270978 * y * y - .002528 * x * x - .0447 * y * y * x - .0140 * x * x * x) * 100 / 36,
    lon: (2.6779094 + 4.728982 * y + .791484 * y * x + .1306 * y * x * x - .0436 * y * y * y) * 100 / 36 };
}
export function parseTlmWater(dbf: Uint8Array, shp: Uint8Array, fetchedAt: string): Amenity[] {
  if (dbf.length < 33 || shp.length < 100) throw new Error("Incomplete EO data");
  const d = view(dbf), s = view(shp), count = d.getUint32(4, true), header = d.getUint16(8, true), length = d.getUint16(10, true);
  if (count > 100000 || header < 33 || length < 2 || header + count * length > dbf.length || s.getInt32(0) !== 9994 || s.getInt32(28, true) !== 1000) throw new Error("Invalid EO data");
  const fields = new Map<string, { offset: number; size: number }>(); let fieldOffset = 1;
  for (let i = 32; i < header - 1 && dbf[i] !== 13; i += 32) {
    if (i + 32 > header) throw new Error("Invalid DBF fields");
    const name = decoder.decode(dbf.subarray(i, i + 11)).split("\0")[0];
    fields.set(name, { offset: fieldOffset, size: dbf[i + 16] }); fieldOffset += dbf[i + 16];
  }
  if (fieldOffset !== length || !fields.has("OBJEKTART") || !fields.has("UUID")) throw new Error("EO schema changed");
  const read = (row: number, name: string) => { const f = fields.get(name); return f ? decoder.decode(dbf.subarray(row + f.offset, row + f.offset + f.size)).trim() : ""; };
  const records: Amenity[] = []; let offset = 100, index = 0;
  while (offset < shp.length) {
    if (offset + 12 > shp.length || index >= count) throw new Error("Invalid shape record");
    const n = s.getUint32(offset + 4) * 2, start = offset + 8, type = s.getInt32(start, true);
    if (n < 4 || start + n > shp.length) throw new Error("Truncated shape record");
    const row = header + index * length, kind = read(row, "OBJEKTART");
    if (dbf[row] !== 42 && ["2", "7", "Brunnen", "Quelle"].includes(kind) && [1, 11, 21].includes(type)) {
      if (n < 20) throw new Error("Truncated EO point");
      const p = lv95ToWgs84(s.getFloat64(start + 4, true), s.getFloat64(start + 12, true));
      const id = read(row, "UUID").replace(/[{}]/g, "").toLowerCase();
      if (!validSwissPoint(p.lat, p.lon) || !/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid EO identity or coordinate");
      const spring = kind === "7" || kind === "Quelle";
      const date = read(row, "DATUM_AEND"), updatedAt = /^\d{8}$/.test(date) ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : undefined;
      records.push({ id: `swisstlm3d:${id}`, ...p, name: read(row, "NAME") || (spring ? "Mapped spring · drinkability unknown" : "Mapped fountain · drinkability unknown"),
        url: TLM_PAGE, area: false, categories: ["water"], potable: "unknown", tags: spring ? { natural: "spring" } : { amenity: "fountain" },
        provenance: { provider: "swisstlm3d", retrievedAt: fetchedAt, datasetDate: "2026-02", ...(updatedAt ? { updatedAt } : {}),
          note: "Topographic point only. Drinkability, public access, bottle filling, seasonal operation and current flow are unknown. Do not rely on this as a refill stop. Coverage is not systematic; it may overlap another source." },
        additionalSources: [{ kind: "feed", label: "Source: Federal Office of Topography swisstopo", url: TLM_PAGE, date: fetchedAt.slice(0, 10), note: "swissTLM3D; no field verification." }] });
    }
    offset = start + n; index++;
  }
  if (index !== count) throw new Error("EO shape and attributes are not aligned");
  return records;
}

export async function loadTlmWater(fetcher: typeof fetch, signal: AbortSignal, fetchedAt: string): Promise<Amenity[]> {
  let etag: string | null = null, total = 0;
  const range = async (rangeValue: string, max: number) => {
    const response = await fetcher(TLM_WATER_ARCHIVE, { headers: { Range: rangeValue, ...(etag ? { "If-Range": etag } : {}) }, signal });
    const match = response.headers.get("Content-Range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
    if (response.status !== 206 || !match || Number(match[2]) - Number(match[1]) + 1 > max || total && total !== Number(match[3]) || etag && etag !== response.headers.get("ETag")) {
      await response.body?.cancel(); throw new Error("Bounded archive access unavailable");
    }
    const explicit = rangeValue.match(/^bytes=(\d+)-(\d+)$/);
    if (explicit && (explicit[1] !== match[1] || explicit[2] !== match[2])) { await response.body?.cancel(); throw new Error("Unexpected byte range"); }
    total = Number(match[3]); etag ??= response.headers.get("ETag");
    const bytes = await readBounded(response, max);
    if (bytes.length !== Number(match[2]) - Number(match[1]) + 1) throw new Error("Incomplete byte range");
    return bytes;
  };
  const tail = await range("bytes=-65557", 65557), d = view(tail); let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (d.getUint32(i, true) === 0x06054b50 && i + 22 + d.getUint16(i + 20, true) === tail.length) { end = i; break; }
  if (end < 0 || d.getUint16(end + 4, true) || d.getUint16(end + 6, true)) throw new Error("Unsupported archive directory");
  const size = d.getUint32(end + 12, true), offset = d.getUint32(end + 16, true);
  if (size < 46 || size > 1024 * 1024 || offset + size > total || offset === 0xffffffff) throw new Error("Archive directory outside bounds");
  const members = zipDirectory(await range(`bytes=${offset}-${offset + size - 1}`, 1024 * 1024));
  const data = new Map<string, Uint8Array>();
  for (const member of members) {
    const header = await range(`bytes=${member.offset}-${member.offset + 29}`, 30), h = view(header);
    if (h.getUint32(0, true) !== 0x04034b50 || h.getUint16(8, true) !== member.method) throw new Error("Invalid local ZIP header");
    const start = member.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    if (start + member.compressed > offset) throw new Error("Archive member outside data bounds");
    const compressed = await range(`bytes=${start}-${start + member.compressed - 1}`, MAX_COMPRESSED);
    const expanded = member.method === 0 ? compressed : await readBounded(new Response(new Blob([compressed.slice().buffer]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"))), MAX_EXPANDED);
    if (expanded.length !== member.size || crc32(expanded) !== member.crc) throw new Error("Archive checksum mismatch");
    data.set(member.name.endsWith(".dbf") ? "dbf" : "shp", expanded);
  }
  return parseTlmWater(data.get("dbf")!, data.get("shp")!, fetchedAt);
}
