import { fetchJson, HttpError, transientFailure, waitFor } from "./http.ts";
import { SEARCH_LIMITS } from "./searchLimits.ts";
import type { NationalTimetableClient } from "./nationalTimetableClient.ts";
import type { StationTransferClient } from "./stationTransferClient.ts";
import type { OjpClient } from "./ojpClient.ts";

const TRANSPORT_URL = "https://transport.opendata.ch/v1";

export function swissDateParts(date: Date, arriveBy = false) {
  // Minute-only providers: round departure readiness up, arrival deadlines down.
  const rounded = new Date((arriveBy ? Math.floor : Math.ceil)(date.getTime() / 60_000) * 60_000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(rounded);
  const v = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? "";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}` };
}

// Short-lived successful replies avoid repeating identical queries when the user
// switches comparisons or repeats a search. Failures never enter this cache.
const timetableCache = new Map<string, { expires: number; data: unknown }>();
let timetableCooldown = 0;
export class TimetableClient {
  stationTransfers?: StationTransferClient;
  national: NationalTimetableClient | null = null;
  ojp?: OjpClient | null;
  publicTimetable = false;
  readonly warnings = new Set<string>();
  requests = 0;
  failures = 0;
  rejectedSections = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, Promise<unknown>>();
  private lastRequest = 0;
  private cooldown = 0;
  private remainingMs = SEARCH_LIMITS.phaseMilliseconds;
  // Charge only this provider's work. Cycling/geocoding must not consume the
  // timetable budget before the next station pair can even be requested.
  beginPhase() { this.remainingMs = SEARCH_LIMITS.phaseMilliseconds; }
  async timed<T>(operation: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try { return await operation(); }
    finally { this.remainingMs -= Math.max(0, Date.now() - started); }
  }
  signal: AbortSignal;
  readonly budget: number;
  private gapMs: number;
  private fetcher: typeof fetch;
  constructor(signal: AbortSignal, gapMs = 400, fetcher: typeof fetch = fetch, budget = SEARCH_LIMITS.requests) {
    this.signal = signal; this.gapMs = gapMs; this.fetcher = fetcher; this.budget = budget;
  }
  /** A new explicit user action has its own bounded allowance. */
  fork(signal: AbortSignal) {
    const next = new TimetableClient(signal, this.gapMs, this.fetcher, this.budget);
    next.publicTimetable = this.publicTimetable;
    next.stationTransfers = this.stationTransfers?.fork();
    next.ojp = this.ojp?.fork(signal);
    next.national = this.national;
    if (next.national) next.national.signal = signal;
    return next;
  }

  claimRequests(calls: number) {
    this.signal.throwIfAborted();
    if (this.remainingMs <= 0) {
      this.warnings.add("The timetable search time limit was reached; some connections were not explored."); return false;
    }
    if (this.requests + calls > this.budget) {
      this.warnings.add("Search request limit reached; some connections were not explored."); return false;
    }
    this.requests += calls; return true;
  }

  get<T>(path: string, params: URLSearchParams): Promise<T | null> {
    if (this.signal.aborted) return Promise.reject(this.signal.reason);
    const url = path === "route" ? `https://search.ch/timetable/api/route.json?${params}` : `${TRANSPORT_URL}/${path}?${params}`;
    const cached = this.cache.get(url);
    if (cached) return cached as Promise<T | null>;
    const reusable = this.fetcher === fetch ? timetableCache.get(url) : undefined;
    if (reusable && reusable.expires > Date.now()) return Promise.resolve(reusable.data as T);
    const task = this.queue.then(() => this.timed(async () => {
      const started = Date.now();
      const remaining = () => this.remainingMs - Math.max(0, Date.now() - started);
      let error: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        this.signal.throwIfAborted();
        if (remaining() <= 0) {
          this.warnings.add("The timetable search time limit was reached; some connections were not explored."); return null;
        }
        if (this.requests >= this.budget) { this.claimRequests(1); return null; }
        const cooldown = Math.max(this.cooldown, this.fetcher === fetch ? timetableCooldown : 0);
        const delay = Math.max(0, this.gapMs - (Date.now() - this.lastRequest), cooldown - Date.now());
        if (delay > 10_000 || delay >= remaining()) {
          error = new Error("The timetable service is busy. Try again later for more options."); break;
        }
        await waitFor(delay, this.signal);
        if (remaining() <= 0) return null;
        if (!this.claimRequests(1)) return null;
        this.lastRequest = Date.now();
        try {
          const data = await fetchJson<{ errors?: unknown[]; error?: string }>(url, this.signal,
            Math.min(SEARCH_LIMITS.requestMilliseconds, remaining()), this.fetcher);
          if (data.errors?.length || data.error) throw new Error("The timetable service rejected some queries; this search is incomplete.");
          this.cooldown = 0;
          if (this.fetcher === fetch) {
            timetableCooldown = 0;
            timetableCache.delete(url); timetableCache.set(url, { expires: Date.now() + (path === "locations" ? 24 * 60 * 60_000 : 30_000), data });
            while (timetableCache.size > 100) timetableCache.delete(timetableCache.keys().next().value!);
          }
          return data as T;
        } catch (caught) {
          this.signal.throwIfAborted(); error = caught;
          const rateLimited = caught instanceof HttpError && caught.status === 429;
          const delay = caught instanceof HttpError && caught.retryAfterMs !== null ? caught.retryAfterMs : this.gapMs * 5;
          if (rateLimited) {
            this.cooldown = Date.now() + (attempt === 0 ? delay : Math.max(delay, 60_000));
            if (this.fetcher === fetch) timetableCooldown = this.cooldown;
          }
          if (attempt === 0 && transientFailure(caught) && delay <= 10_000 && delay < remaining() && this.requests < this.budget) {
            if (!rateLimited) await waitFor(delay, this.signal);
            continue;
          }
          if (rateLimited) error = new Error("The timetable service is busy. Try again later for more options.");
          break;
        }
      }
      this.failures++;
      this.warnings.add(error instanceof Error && !["TimeoutError", "TypeError"].includes(error.name)
        ? error.message : "Some timetable requests timed out or could not connect; this search is incomplete.");
      return null;
    }));
    this.cache.set(url, task); this.queue = task.catch(() => undefined);
    void task.then(value => { if (value === null) this.cache.delete(url); }, () => this.cache.delete(url));
    return task;
  }
}
