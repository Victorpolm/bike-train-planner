import { PRICE_SOURCES, tariffHealth, type MonitoredTariff } from "./tariffSources.ts";
import { LOCAL_TRANSPORT_POLICIES, LOCAL_REVIEW_FROM, LOCAL_REVIEW_THROUGH } from "./localTransport.ts";
import { TPG_ZONE_10_LINES } from "./data/tpgZone10.ts";

/** Source retrieval never changes reviewed rules or their effective dates. */
const candidates: MonitoredTariff[] = [
  ...PRICE_SOURCES,
  ...LOCAL_TRANSPORT_POLICIES.map(p=>({id:"operator-"+p.id,...p.source,
    validFrom:LOCAL_REVIEW_FROM,validThrough:LOCAL_REVIEW_THROUGH,reviewBy:"2026-11-12",
    format:p.source.url.endsWith(".pdf")?"pdf" as const:"html" as const,scope:p.ticket})),
  ...TPG_ZONE_10_LINES.map(line=>({id:"tpg-line-"+line.line,title:"TPG Zone 10 line "+line.line,url:line.source,
    checked:LOCAL_REVIEW_FROM,validFrom:LOCAL_REVIEW_FROM,validThrough:LOCAL_REVIEW_THROUGH,
    reviewBy:line.line==="12"?"2026-10-17":"2026-11-12",format:"html" as const,
    scope:"Reviewed stop membership; re-check new stops and branches before extending fare coverage"})),
  {id:"tpg-stops",title:"TPG open stop catalogue metadata",url:"https://opendata.tpg.ch/api/explore/v2.1/catalog/datasets/arrets",
    checked:LOCAL_REVIEW_FROM,validFrom:LOCAL_REVIEW_FROM,validThrough:LOCAL_REVIEW_THROUGH,reviewBy:"2026-11-12",format:"json",
    scope:"Dataset edition metadata; a change prompts a fresh stop/line join, not an automatic zone assignment"},
  {id:"tpg-carriage",title:"TPG formal carriage regulations",url:"https://www.tpg.ch/sites/default/files/2024-08/Drt-tpg_adaptations-etat_au_1er_aout_2024.pdf",
    checked:LOCAL_REVIEW_FROM,validFrom:LOCAL_REVIEW_FROM,validThrough:LOCAL_REVIEW_THROUGH,reviewBy:"2026-11-12",format:"pdf",
    scope:"Folded/bagged bicycle and trailer requirements; review the current regulations link for successors"},
];
// A single retrieval suffices when tariff and operator rules cite the same PDF.
export const MONITORED_SOURCES=candidates.filter((s,i)=>candidates.findIndex(p=>p.url===s.url)===i);
export const monitoredHealth=(now=new Date())=>tariffHealth(now,60,MONITORED_SOURCES);
