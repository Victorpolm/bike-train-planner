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
  PAG: "PAG", POSTAUTO: "PAG", "POSTAUTO AG": "PAG", POSTBUS: "PAG", "OJP:801": "PAG",
  TPG: "TPG", "TRANSPORTS PUBLICS GENEVOIS": "TPG", "OJP:881": "TPG",
  TPF: "TPF", "TRANSPORTS PUBLICS FRIBOURGEOIS": "TPF", "TPF AUTO": "TPF", "TPF-AUTO": "TPF", "TPF/TF": "TPF", "OJP:53": "TPF", "OJP:834": "TPF", "OJP:791": "TPF",
  BERNMOBIL: "BERNMOBIL", SVB: "BERNMOBIL", "SVB AUTO": "BERNMOBIL", "OJP:827": "BERNMOBIL",
  VBL: "VBL", "VERKEHRSBETRIEBE LUZERN": "VBL", "VERKEHRSBETRIEBE LUZERN AG": "VBL", "OJP:820": "VBL",
  "ENGADIN BUS": "ENGADINBUS", ENGADINBUS: "ENGADINBUS", "BUS/EB": "ENGADINBUS", "OJP:815": "ENGADINBUS",
  AAGS: "AAGS", "AUTO AG SCHWYZ": "AAGS", "OJP:841": "AAGS",
  ZVB: "ZVB", "ZUGERLAND VERKEHRSBETRIEBE": "ZVB", "OJP:839": "ZVB",
  ZBB: "ZBB", "ZUGERBERG BAHN": "ZBB", "OJP:158": "ZBB",
  SGZ: "SGZ", "SCHIFFFAHRTSGESELLSCHAFT FÜR DEN ZUGERSEE": "SGZ", "OJP:186": "SGZ",
  AES: "AES", "ÄGERISEE SCHIFFFAHRT": "AES", "OJP:179": "AES",
  THURBO: "THURBO", "THURBO AG": "THURBO", "OJP:65": "THURBO",
  TRANSN: "TRANSN", TRN: "TRANSN", "TRN-CMN": "TRANSN", "TRN-RVT": "TRANSN", "TRN-TN": "TRANSN", "TRN/TC": "TRANSN", "OJP:44": "TRANSN", "OJP:73": "TRANSN", "OJP:153": "TRANSN", "OJP:792": "TRANSN",
};
// Exact reviewed aliases; no substring/fuzzy matching that could confer access
// on an unrelated operator or a replacement service.
export const operatorCode = (value?: string | null) => {
  const code = normalizeCode(value);
  return OPERATOR_ALIASES[code] ?? code;
};
