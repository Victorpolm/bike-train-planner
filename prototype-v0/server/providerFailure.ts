// Classify operational failures without logging messages that might contain a key.
export function providerFailure(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const message = error.message;
  if (/redirect/i.test(message)) return "redirect-mode";
  if (/header|ByteString|ISO-8859/i.test(message)) return "header-format";
  if (/illegal invocation|incorrect this|invalid receiver/i.test(message)) return "fetch-receiver";
  if (/abort|signal|timeout/i.test(message) || ["AbortError", "TimeoutError"].includes(error.name)) return "timeout-or-signal";
  if (/certificate|\bTLS\b|\bSSL\b/i.test(message)) return "tls";
  if (/network|fetch failed|failed to fetch|\bDNS\b/i.test(message)) return "network";
  if (/stream|reader|body/i.test(message)) return "response-body";
  if (/context|different request/i.test(message)) return "request-context";
  return error.name === "TypeError" ? "other-type-error" : "other-error";
}
