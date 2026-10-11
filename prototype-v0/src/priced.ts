export type PriceSource = { id?: string; title: string; url: string; checked: string; validFrom?: string; validThrough?: string };
export type Offer = { chf: number; product: { id: string; name: string };
  flexibility: "flexible" | "train-bound" | "time-bound" | "unknown";
  availability: "published-tariff" | "capacity-limited" | "unknown";
  conditions: string[];
  provenance: { basis: "published" | "quoted" | "entitlement"; source: PriceSource; environment: "production" | "test"; checkedAt?: string } };
export type Priced = { known: true; offer: Offer } | { known: false; code: "prohibited" | "expired" | "unreviewed" | "incomplete" | "restricted-offer"; reason: string; whoCanPrice?: { operator: string; url: string }[] };
export const unknownPrice = (reason: string, code: Extract<Priced,{known:false}>["code"] = "unreviewed", whoCanPrice?: { operator: string; url: string }[]): Priced => ({ known:false, code, reason, ...(whoCanPrice?.length ? {whoCanPrice}: {}) });
export function knownPrice(chf: number, name: string, source: PriceSource, options: Partial<Omit<Offer,"chf"|"product"|"provenance">> & { id?: string; basis?: Offer["provenance"]["basis"]; environment?: "test"|"production"; checkedAt?: string } = {}): Priced {
  if (!Number.isFinite(chf) || chf < 0) return unknownPrice("No valid price was supplied.");
  return {known:true,offer:{chf,product:{id:options.id??name,name},flexibility:options.flexibility??"flexible",availability:options.availability??"published-tariff",
    conditions:options.conditions??[],provenance:{basis:options.basis??"published",source,environment:options.environment??"production",...(options.checkedAt?{checkedAt:options.checkedAt}:{})}}};
}
export const priceAmount = (p: Priced) => p.known ? p.offer.chf : null;
export const priceLabel = (p: Priced) => p.known ? `CHF ${p.offer.chf.toFixed(2)}` : p.code === "prohibited" ? "Not permitted" : "Price to check";
export const priceConditions = (p: Priced) => p.known ? [p.offer.product.name,
  ...(p.offer.flexibility === "train-bound" ? ["Only on the quoted train · limited availability"] : []),
  ...p.offer.conditions, p.offer.provenance.environment === "test" ? "OJP test fare estimate" : "",
  p.offer.provenance.source.validThrough ? `Tariff valid through ${p.offer.provenance.source.validThrough}` : ""].filter(Boolean).join(" · ") : p.reason;
export function sumPrices(parts: Priced[], source: PriceSource): Priced {
  const missing = parts.find(p => !p.known); if(missing) return missing;
  const offers = parts.map(p => (p as Extract<Priced,{known:true}>).offer);
  if(offers.some(o=>o.flexibility !== "flexible")) return unknownPrice("A flexible total is unavailable; see the separately labelled restricted offer.", "restricted-offer");
  return knownPrice(Math.round(offers.reduce((n,o)=>n+o.chf,0)*100)/100,"Additional cost",source,{environment:offers.some(o=>o.provenance.environment==="test")?"test":"production",conditions:offers.flatMap(o=>o.conditions)});
}
