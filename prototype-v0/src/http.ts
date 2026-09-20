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
      throw new HttpError(response.status, detail.trim());
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
  constructor(status: number, detail = "") {
    super(`Service request failed (HTTP ${status}).`); this.status = status; this.detail = detail;
  }
}
