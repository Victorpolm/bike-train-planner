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
    if (!response.ok) throw new HttpError(response.status);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number) { super(`Location or timetable request failed (HTTP ${status}).`); this.status = status; }
}
