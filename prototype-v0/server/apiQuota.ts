import { waitFor } from "../src/http.ts";

type Statement = { bind(...values: (string | number)[]): Statement; };
export type QuotaDatabase = {
  prepare(sql: string): Statement;
  batch<T>(statements: Statement[]): Promise<{ results: T[]; success: boolean }[]>;
};
export type QuotaEnvironment = { DB?: QuotaDatabase };
export class QuotaError extends Error {
  status: number; retryAfter: number;
  constructor(message: string, status = 429, retryAfter = 60) {
    super(message); this.name = "QuotaError"; this.status = status; this.retryAfter = retryAfter;
  }
}
export type QuotaGate = (env: QuotaEnvironment, key: string, signal: AbortSignal) => Promise<void>;
const HOUR = 3_600_000, DAY = 24 * HOUR;
// 1.5 s between admissions gives <=40 calls/minute, below the published50.
// Sum the current hour and previous24 hours: a conservative rolling24h20k
// cap, independent of an undocumented provider midnight/reset timezone.
const ADMIT = `INSERT INTO api_quota_clock(key_hash,next_at,permit,blocked_until)
 SELECT ?1,?2+1500,?3,0 WHERE
 (SELECT COALESCE(SUM(used),0) FROM api_quota_hours WHERE key_hash=?1 AND hour>=?4)<20000
 ON CONFLICT(key_hash) DO UPDATE SET next_at=excluded.next_at,permit=excluded.permit
 WHERE api_quota_clock.next_at<=?2 AND api_quota_clock.blocked_until<=?2`;
const COUNT = `INSERT INTO api_quota_hours(key_hash,hour,used)
 SELECT ?1,?2,1 WHERE EXISTS(SELECT 1 FROM api_quota_clock WHERE key_hash=?1 AND permit=?3)
 ON CONFLICT(key_hash,hour) DO UPDATE SET used=used+1`;
const STATE = `SELECT c.permit,c.next_at,c.blocked_until,
 (SELECT COALESCE(SUM(used),0) FROM api_quota_hours WHERE key_hash=?1 AND hour>=?2) AS used,
 (SELECT MIN(hour) FROM api_quota_hours WHERE key_hash=?1 AND hour>=?2) AS oldest
 FROM api_quota_clock c WHERE key_hash=?1`;
async function keyHash(key: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("re.route:api-quota:" + key));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
}
export async function reserveApiCall(env: QuotaEnvironment, key: string, now = Date.now()) {
  if (!env.DB) throw new QuotaError("The shared API quota service is unavailable. Please try again shortly.", 503);
  const hash = await keyHash(key), permit = crypto.randomUUID(), hour = Math.floor(now / HOUR) * HOUR, cutoff = hour - DAY;
  try {
    // D1 batch is one serialized transaction. Both the winning nonce and its
    // counter increment are committed together across all Worker instances.
    const result = await env.DB.batch<{ permit: string; next_at: number; blocked_until: number; used: number; oldest: number }>([
      env.DB.prepare(ADMIT).bind(hash, now, permit, cutoff),
      env.DB.prepare(COUNT).bind(hash, hour, permit),
      env.DB.prepare("DELETE FROM api_quota_hours WHERE key_hash=?1 AND hour<?2").bind(hash, cutoff),
      env.DB.prepare(STATE).bind(hash, cutoff),
    ]);
    if (result.length !== 4 || result.some(r => !r.success)) throw new Error("Quota transaction failed");
    const state = result[3].results[0];
    if (state?.permit === permit) return 0;
    if (state?.used >= 20000) throw new QuotaError("The shared daily journey-data allowance has been reached. Try again later.", 429,
      Math.max(1, Math.ceil((state.oldest + 25 * HOUR - now) / 1000)));
    return Math.max(1, (state?.next_at ?? now + 1500) - now, (state?.blocked_until ?? 0) - now);
  } catch (error) {
    if (error instanceof QuotaError) throw error;
    // No unmetered fallback when storage is unavailable.
    throw new QuotaError("The shared API quota service is unavailable. Please try again shortly.", 503);
  }
}
export const claimApiCall: QuotaGate = async (env, key, signal) => {
  for (;;) {
    signal.throwIfAborted();
    const delay = await reserveApiCall(env, key);
    signal.throwIfAborted();
    if (!delay) return;
    if (delay > 10_000) throw new QuotaError("The journey-data provider is temporarily busy. Try again shortly.", 429, Math.ceil(delay / 1000));
    await waitFor(delay, signal);
  }
};
export async function coolDownApi(env: QuotaEnvironment, key: string) {
  if (!env.DB) return;
  try {
    await env.DB.batch([env.DB.prepare("UPDATE api_quota_clock SET blocked_until=MAX(blocked_until,?2) WHERE key_hash=?1")
      .bind(await keyHash(key), Date.now() + 60_000)]);
  } catch { /* The next admission still fails closed if storage is down. */ }
}
export function quotaResponse(error: QuotaError) {
  return Response.json({ error: error.message }, { status: error.status, headers: {
    "Retry-After": String(error.retryAfter), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  } });
}
