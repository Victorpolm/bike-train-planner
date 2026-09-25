export const SEARCH_DEADLINE_MS = 60_000;
export class SearchDeadline {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  readonly started = Date.now();
  expired = false;
  private timer: ReturnType<typeof setTimeout>;
  private detach: () => void;
  constructor(parent: AbortSignal, milliseconds = SEARCH_DEADLINE_MS) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) throw new Error("Invalid search deadline.");
    const abort = () => this.controller.abort(parent.reason);
    if (parent.aborted) abort();
    else parent.addEventListener("abort", abort, { once: true });
    this.detach = () => parent.removeEventListener("abort", abort);
    this.timer = setTimeout(() => {
      this.expired = true;
      this.controller.abort(new DOMException("The search time limit was reached.", "TimeoutError"));
    }, milliseconds);
  }
  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.signal.aborted) { this.finish(); this.signal.throwIfAborted(); }
    let detach = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      const abort = () => reject(this.signal.reason);
      this.signal.addEventListener("abort", abort, { once: true });
      detach = () => this.signal.removeEventListener("abort", abort);
    });
    try { return await Promise.race([operation(), cancelled]); }
    finally { detach(); this.finish(); }
  }
  finish() { clearTimeout(this.timer); this.detach(); }
}
