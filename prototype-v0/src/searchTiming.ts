export const TIMING_STAGES = ["places", "setup", "stops", "timetable", "transfers", "cycling", "walking", "network", "queue", "pacing", "reuse", "solving"] as const;
export type TimingStage = typeof TIMING_STAGES[number];
export type TimingStatus = "running" | "complete" | "limited" | "cancelled" | "failed";
export type SearchTimingReport = {
  status: TimingStatus; elapsedMs: number; firstResultMs: number | null; firstTransitMs: number | null;
  stages: Partial<Record<TimingStage, { calls: number; milliseconds: number }>>;
  refreshes: number; reusedRefreshes: number; solverCalls: number;
};
const noop = () => {};
const clocks = new WeakMap<AbortSignal, SearchTiming>();
/** Per-action, in-memory totals only: no coordinates, URLs, traces or telemetry. */
export class SearchTiming {
  private readonly now: () => number;
  private readonly started: number;
  private ended?: number;
  private status: TimingStatus = "running";
  private firstResult: number | null = null;
  private firstTransit: number | null = null;
  private stages: SearchTimingReport["stages"] = {};
  private active = new Set<() => void>();
  private refreshes = 0;
  private reused = 0;
  private solves = 0;
  constructor(now: () => number = () => performance.now()) { this.now = now; this.started = now(); }
  begin(stage: TimingStage): () => void {
    if (this.ended !== undefined) return noop;
    const began = this.now(), total = this.stages[stage] ??= { calls: 0, milliseconds: 0 };
    total.calls++;
    let closed = false;
    const end = () => {
      if (closed) return;
      closed = true; total.milliseconds += Math.max(0, (this.ended ?? this.now()) - began); this.active.delete(end);
    };
    this.active.add(end); return end;
  }
  sync<T>(stage: TimingStage, operation: () => T): T {
    const end = this.begin(stage); try { return operation(); } finally { end(); }
  }
  async measure<T>(stage: TimingStage, operation: () => Promise<T>): Promise<T> {
    const end = this.begin(stage); try { return await operation(); } finally { end(); }
  }
  result(transit: boolean, cycling: boolean) {
    if (this.ended !== undefined) return;
    const elapsed = Math.max(0, this.now() - this.started);
    if ((transit || cycling) && this.firstResult === null) this.firstResult = elapsed;
    if (transit && this.firstTransit === null) this.firstTransit = elapsed;
  }
  refresh(reused: boolean) { if (this.ended === undefined) { this.refreshes++; this.reused += Number(reused); } }
  solve(count = 1) { if (this.ended === undefined) this.solves += count; }
  finish(status: Exclude<TimingStatus, "running">): SearchTimingReport {
    if (this.ended === undefined) {
      this.ended = this.now(); this.status = status;
      for (const end of this.active) end();
    }
    return this.report();
  }
  report(): SearchTimingReport {
    return { status: this.status, elapsedMs: Math.max(0, (this.ended ?? this.now()) - this.started),
      firstResultMs: this.firstResult, firstTransitMs: this.firstTransit,
      stages: Object.fromEntries(Object.entries(this.stages).map(([key, value]) => [key, { ...value }])),
      refreshes: this.refreshes, reusedRefreshes: this.reused, solverCalls: this.solves };
  }
}
export function bindSearchTiming(signal: AbortSignal, timing: SearchTiming) { clocks.set(signal, timing); }
export const searchTiming = (signal?: AbortSignal) => signal ? clocks.get(signal) : undefined;
export const beginTiming = (signal: AbortSignal | undefined, stage: TimingStage) => searchTiming(signal)?.begin(stage) ?? noop;
export async function measureStage<T>(signal: AbortSignal, stage: TimingStage, operation: () => Promise<T>): Promise<T> {
  const end = beginTiming(signal, stage); try { return await operation(); } finally { end(); }
}
