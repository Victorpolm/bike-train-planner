import type { PriceSource } from "./priced.ts";
export type MonitoredTariff = PriceSource & { id: string; validFrom: string; validThrough: string; reviewBy: string; format: "html" | "pdf"; scope: string };
/** Coverage cutoffs are local reviewed-data boundaries, not claims that the publisher ends a product. */
export const PRICE_SOURCES: MonitoredTariff[] = [
  {id:"zvv",title:"ZVV published single tickets",url:"https://www.zvv.ch/de/abos-und-tickets/tickets/einzelbillette.html",checked:"2026-09-27",validFrom:"2025-12-14",validThrough:"2026-12-12",reviewBy:"2026-11-12",format:"html",scope:"Reviewed rail corridors and 2nd-class zone fares"},
  {id:"zpass",title:"Z-Pass A-Welle–ZVV single tickets",url:"https://www.zvv.ch/de/abos-und-tickets/weitere-angebote/tarifverbund-z-pass/abo-und-billette.html",checked:"2026-09-27",validFrom:"2025-12-14",validThrough:"2026-12-12",reviewBy:"2026-11-12",format:"html",scope:"Reviewed A-Welle/ZVV rail corridors"},
  {id:"bike-day",title:"SBB Bike Day Pass",url:"https://www.sbb.ch/en/offers/bike-day-pass",checked:"2026-10-11",validFrom:"2026-01-01",validThrough:"2027-12-11",reviewBy:"2026-12-01",format:"html",scope:"CHF 15 through 2026-12-12, CHF 16 from 2026-12-13; reviewed coverage ends 2027-12-11"},
  {id:"t600",title:"Alliance SwissPass T600",url:"https://www.allianceswisspass.ch/de/asp/Downloads?download=2666",checked:"2026-10-11",validFrom:"2026-06-01",validThrough:"2026-12-12",reviewBy:"2026-11-12",format:"pdf",scope:"Child bicycle concessions; reservations; luggage; review at timetable change"},
  {id:"bike-coverage",title:"T600 participating operators",url:"https://www.allianceswisspass.ch/de/asp/Downloads?download=21132",checked:"2026-10-11",validFrom:"2026-06-01",validThrough:"2026-12-12",reviewBy:"2026-11-12",format:"pdf",scope:"Bicycle-pass operator acceptance; never vehicle capacity"},
];
export const tariffSource = (id:string) => PRICE_SOURCES.find(s=>s.id===id)!;
export function tariffHealth(on=new Date(), warningDays=60) {
  const day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Zurich"}).format(on);
  return PRICE_SOURCES.map(source=>{
    const daysRemaining=Math.round((Date.parse(source.validThrough)-Date.parse(day))/86400000);
    const state=day>source.validThrough?"expired":day>=source.reviewBy||daysRemaining<=warningDays?"review-due":"current";
    return {source,state,daysRemaining};
  });
}
export const lapsing = (on=new Date(),days=60) => tariffHealth(on,days).filter(s=>s.state!=="current");
