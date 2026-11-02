/** Explicit service restrictions for an ordinary bicycle. Folding-bike
 * exceptions are outside the current product scope; packing is a condition. */
export type BicycleHandling = {
  foldingOnly?: boolean;
  bagRequired?: boolean;
  bagProhibited?: boolean;
  unresolved?: boolean;
  instructions: string[];
};
const normal = (s: string) => s.normalize("NFKC").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!]$/, "");
// Complete clauses only. Never infer a bag exemption from a folding-bike rule,
// an optional bag, a luggage-coach symbol or an unrecognised service code.
const foldingOnly = [
  /^(?:bicycles?: )?only (?:folding|folded)(?: and bagged)? (?:bikes|bicycles)(?: in (?:transport )?bags)?(?: (?:are )?(?:allowed|permitted|accepted))?$/,
  /^(?:bicycles?|bikes): (?:folding|folded) (?:bicycles|bikes) only$/,
  /^(?:velos?: )?seuls les velos (?:pliants|plies)(?: et emballes)? sont (?:autorises|acceptes)$/,
  /^(?:velos?: )?nur (?:klappvelos|faltvelos|faltrader|zusammengeklappte (?:velos|fahrrader))(?: (?:sind )?(?:erlaubt|gestattet|zugelassen))?$/,
  /^(?:biciclette: )?solo biciclette pieghevoli(?: (?:ammesse|consentite))?$/,
];
const bagRequired = [
  /^(?:bicycles?|bikes): (?:transport )?bag required$/,
  /^(?:bicycles?|bikes) can only be carried in (?:a )?(?:bicycle |transport |bike )?bag$/,
  /^(?:bicycles?|bikes) must be (?:fully )?(?:packed|enclosed|transported) in (?:a )?(?:bicycle |transport |bike )?bag$/,
  /^(?:bicycles?|bikes)(?: are)? (?:only (?:allowed|permitted|accepted|carried)|(?:allowed|permitted|accepted|carried) only) (?:if |when )?(?:fully )?(?:packed |enclosed |transported )?in (?:a )?(?:bicycle |transport |bike )?bag$/,
  /^(?:velos?: )?(?:les )?velos (?:sont autorises uniquement|doivent etre transportes) dans (?:une housse|un sac)(?: de transport)?$/,
  /^velos?: (?:housse|sac de transport) obligatoire$/,
  /^velos?: transport uniquement dans (?:une housse|un sac de transport)$/,
  /^(?:velos?|fahrrader)(?: sind)? nur (?:verpackt )?in (?:einer )?(?:transporttasche|velotasche)(?: (?:erlaubt|zugelassen|gestattet))?$/,
  /^biciclette: (?:sacca|borsa) di trasporto obbligatoria$/,
];
export function interpretBicycleHandling(attributes: {code:string;text:string}[]): BicycleHandling | undefined {
  const result: BicycleHandling = { instructions: [] };
  for (const a of attributes) {
    if (a.code === "A__VT") result.bagProhibited = true;
    const clauses = normal(a.text).split(/[.!]\s+/);
    const fold = clauses.some(s => foldingOnly.some(pattern => pattern.test(s)));
    const bag = clauses.some(s => bagRequired.some(pattern => pattern.test(s)));
    if (fold) result.foldingOnly = true;
    if (bag) result.bagRequired = true;
    if (fold || bag) result.instructions.push(a.text.trim());
    // A textual qualifier we cannot interpret must not be erased by a filter match.
    if (!fold && !bag && a.code !== "A__VT" && /\bfold(?:ed|ing)?\b|pliant|plies|klapp|faltvel|faltrad|pieghevol|\bbag(?:ged|s)?\b|housse|sac de transport|transporttasche|velotasche|sacca|borsa/i.test(normal(a.text))) result.unresolved = true;
  }
  if (result.bagRequired && result.bagProhibited) result.unresolved = true;
  return Object.keys(result).length > 1 ? result : undefined;
}
export function mergeBicycleHandling(a?: BicycleHandling, b?: BicycleHandling): BicycleHandling | undefined {
  if (!a) return b;
  if (!b) return a;
  const bagRequired = !!(a.bagRequired || b.bagRequired), bagProhibited = !!(a.bagProhibited || b.bagProhibited);
  return { foldingOnly: !!(a.foldingOnly || b.foldingOnly), bagRequired, bagProhibited,
    unresolved: !!(a.unresolved || b.unresolved || bagRequired && bagProhibited),
    instructions: [...new Set([...a.instructions, ...b.instructions])] };
}
