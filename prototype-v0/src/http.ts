// AbortController works on browsers that do not yet implement AbortSignal.any/timeout.
// Keep the deadline active while reading the response body, not only its headers.
export async function fetchJson<T>(url: string | URL, signal: AbortSignal | undefined,
  timeoutMs: number, fetcher: typeof fetch = fetch): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  try {
    if (controller.signal.aborted) throw controller.signal.reason;
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) {
      // Status alone is ambiguous: routing services can return HTTP 400 for a
      // timeout as well as a missing path. Bound the diagnostic; the UI never
      // renders raw provider text.
      let detail = "";
      if (response.body) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let bytes = 0;
        try {
          while (bytes < 2048) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = value.subarray(0, 2048 - bytes);
            detail += decoder.decode(chunk, { stream: true }); bytes += chunk.length;
          }
          detail += decoder.decode();
        } finally { void reader.cancel().catch(() => {}); }
      }
      if (controller.signal.aborted) throw controller.signal.reason;
      throw new HttpError(response.status, detail.trim(), response.headers.get("Retry-After"));
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export class HttpError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly retryAfterMs: number | null;
  constructor(status: number, detail = "", retryAfter: string | null = null) {
    super(`Service request failed (HTTP ${status}).`); this.status = status; this.detail = detail;
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter ?? "") - Date.now();
    this.retryAfterMs = Number.isFinite(delay) ? Math.max(0, delay) : null;
  }
}

export function transientFailure(error: unknown) {
  return error instanceof HttpError ? [408, 429, 500, 502, 503, 504].includes(error.status)
    || error.status === 400 && /timeout|timed out|time limit/i.test(error.detail)
    : error instanceof Error && ["TimeoutError", "TypeError", "SyntaxError"].includes(error.name);
}

export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
