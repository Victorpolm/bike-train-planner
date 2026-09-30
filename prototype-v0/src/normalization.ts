// Display labels and known, case-insensitive operator/category codes only.
// Never apply these helpers to opaque provider journey references or stop IDs.
export const normalizeName = (value?: string | null) =>
  value?.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() ?? "";
export const normalizeCode = (value?: string | null) =>
  value?.normalize("NFKC").toUpperCase().replace(/\s+/g, " ").trim() ?? "";

const OPERATOR_ALIASES: Readonly<Record<string, string>> = {
  SOB: "SOB", "SOB-SOB": "SOB", "OJP:82": "SOB", "SCHWEIZERISCHE SÜDOSTBAHN": "SOB",
  "SCHWEIZERISCHE SÜDOSTBAHN AG": "SOB", "SCHWEIZERISCHE SÜDOSTBAHN (SOB)": "SOB",
  "SCHWEIZERISCHE SÜDOSTBAHN AG (SOB)": "SOB",
  SBB: "SBB", "SBB CFF FFS": "SBB", CFF: "SBB", FFS: "SBB", "OJP:11": "SBB",
  BLS: "BLS", "BLS-BLS": "BLS", "BLS AG": "BLS", "OJP:33": "BLS",
  RHB: "RHB", "RHB-RHB": "RHB", "RHÄTISCHE BAHN": "RHB", "RHÄTISCHE BAHN AG": "RHB", "OJP:72": "RHB",
};
// Exact reviewed aliases; no substring/fuzzy matching that could confer access
// on an unrelated operator or a replacement service.
export const operatorCode = (value?: string | null) => {
  const code = normalizeCode(value);
  return OPERATOR_ALIASES[code] ?? code;
};
