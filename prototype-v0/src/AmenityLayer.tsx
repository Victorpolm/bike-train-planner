import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { OSM_COPYRIGHT, parkingDistance } from "./bikeParking.ts";
import { parkingAlongRoute, parkingIndex, type ParkingRouteScope } from "./parkingMap.ts";
import { amenityAccess, amenityDetails, amenityStyle, closestAmenity, AMENITY_STYLES, type Amenity, type AmenityCategory, type AmenityData } from "./osmAmenities.ts";
import type { AmenityLoadError } from "./amenityClient.ts";
import { clusterAmenities } from "./amenityClusters.ts";
import { SERVICE_FILTERS, serviceLinks, serviceMatches, serviceSummary, type ServiceKind } from "./osmServices.ts";
import type { Place } from "./routing.ts";
import { amenityLocationLinks, amenitySourceLinks, locationSummary } from "./amenityLocation.ts";
import { FACILITY_SOURCES, type FacilityLoad, type FacilityProvider } from "./facilitySources.ts";

const GLYPH_PATHS = {
  water: 'M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z',
  repairs: 'M21 3a6 6 0 0 1-7.7 7.7l-8 8a2.1 2.1 0 0 1-3-3l8-8A6 6 0 0 1 18 0l-4 4 2 2 5-3Z',
  food: 'M12 7C5 2 1 8 3 15c2 8 6 7 9 5 3 2 7 3 9-5 2-7-2-13-9-8Zm0-2c0-3 3-5 6-4 0 3-3 5-6 4Z',
};
export function AmenityGlyph({ category }: { category: AmenityCategory }) {
  return category === "toilets" ? <b aria-hidden="true">WC</b> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d={GLYPH_PATHS[category]} fill="currentColor" /></svg>;
}
export function WaterGlyph() { return <AmenityGlyph category="water" />; }
function icon(category: AmenityCategory, color: string, closest: boolean, offset: number, count?: number) {
  const badge = document.createElement("span"); badge.className = `amenity-badge amenity-${category}${count ? " amenity-cluster-badge" : ""}`;
  badge.style.backgroundColor = color; badge.setAttribute("aria-hidden", "true");
  if (category !== "toilets") badge.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${GLYPH_PATHS[category]}" fill="currentColor"/></svg>`;
  else badge.textContent = "WC";
  if (count) { const number = document.createElement("b"); number.textContent = String(count); badge.append(number); }
  const size = closest ? 36 : count ? 48 : 32;
  return L.divIcon({ className: `amenity-marker${closest ? " amenity-marker-closest" : ""}`, html: badge,
    iconSize: [size, size], iconAnchor: [size / 2 - offset, size / 2], popupAnchor: [offset, -size / 2] });
}
function textNode(text: string) { const node = document.createElement("span"); node.textContent = text; return node; }
function popup(facility: Amenity, category: AmenityCategory) {
  const node = document.createElement("div"), title = document.createElement("strong"); title.textContent = facility.name; node.append(title);
  for (const line of amenityDetails(facility, category)) { const p = document.createElement("p"); p.textContent = line; node.append(p); }
  if (category === "repairs" || category === "food") for (const contact of serviceLinks(facility.tags)) {
    const p = document.createElement("p"), a = document.createElement("a"); a.href = contact.href; a.textContent = contact.label;
    a.target = "_blank"; a.rel = "noopener noreferrer"; p.append(a); node.append(p);
  }
  for (const link of [...amenityLocationLinks(facility), ...amenitySourceLinks(facility)]) {
    const p = document.createElement("p"), a = document.createElement("a"); a.href = link.href; a.textContent = link.label;
    a.target = "_blank"; a.rel = "noopener noreferrer"; p.append(a); node.append(p);
  }
  return node;
}

type Props = { category: AmenityCategory; map: L.Map | null; origin: Place | null; data?: AmenityData; records: readonly Amenity[];
  loading: boolean; error?: AmenityLoadError; retry: () => void; scope: ParkingRouteScope | null; alongJourney: boolean;
  active: boolean; onActivate: () => void; radius: number; sharedCategories: Map<string, AmenityCategory[]>;
  sourceLoads: FacilityLoad[]; retrySource: (provider: FacilityProvider) => void;
  includeTopographicWater: boolean; onTopographicWater: (enabled: boolean) => void;
  kinds?: ServiceKind[]; onKinds?: (kinds: ServiceKind[]) => void; onLocate: (facility: Amenity) => void };
export default function AmenityLayer({ category, map, origin, data, records, loading, error, retry, scope, alongJourney,
  active, onActivate, radius, sharedCategories, kinds, onKinds, onLocate, sourceLoads, retrySource, includeTopographicWater, onTopographicWater }: Props) {
  const service = category === "repairs" || category === "food" ? category : null;
  const label = { water: "Water fountains", toilets: "Toilets", repairs: "Repairs and bike shops", food: "Food and drinks" }[category];
  const closestLabel = { water: "drinking water", toilets: "toilet", repairs: "matching bicycle service", food: "matching food stop" }[category];
  const [mapNote, setMapNote] = useState("");
  const [request, setRequest] = useState<{ scope: string; serial: number } | null>(null);
  const facilities = useMemo(() => records.filter(f => f.categories.includes(category)), [records, category]);
  const index = useMemo(() => parkingIndex(facilities), [facilities]);
  const inScope = useMemo(() => alongJourney && scope ? parkingAlongRoute(index, scope, radius) : facilities, [alongJourney, scope, index, facilities, radius]);
  const visible = useMemo(() => service && kinds ? inScope.filter(f => serviceMatches(f, service, kinds)) : inScope, [inScope, service, kinds]);
  const scopeKey = JSON.stringify([scope?.key, alongJourney, radius, kinds]);
  const closest = useMemo(() => active && request?.scope === scopeKey ? closestAmenity(visible, origin, category, kinds) : null,
    [active, request, scopeKey, visible, origin?.lat, origin?.lon, category, kinds]);
  const locate = useRef(onLocate); locate.current = onLocate;
  useEffect(() => { if (closest && origin) locate.current(closest.facility); }, [closest, origin?.lat, origin?.lon]);

  useEffect(() => {
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const draw = () => {
      layer.clearLayers();
      const bounds = map.getBounds().pad(.1), zoom = map.getZoom();
      const candidates = visible.filter(f => f.id !== closest?.facility.id && bounds.contains([f.lat, f.lon]) && (service || alongJourney || zoom >= 13));
      const zoomGroups = !!service && zoom < 17;
      const groups = clusterAmenities(candidates, f => map.project([f.lat, f.lon], zoom), zoomGroups ? 52 : 24);
      const limited = groups.length > 1000;
      const drawPoint = (facility: Amenity, isClosest: boolean) => {
        const style = amenityStyle(facility, category, kinds), shared = sharedCategories.get(facility.id) ?? [category];
        const offset = shared.length > 1 ? (shared.indexOf(category) - (shared.length - 1) / 2) * 30 : 0;
        const title = [ `${label}: ${facility.name}`, locationSummary(facility), service ? serviceSummary(facility, service) : style.label ].filter(Boolean).join(" · ");
        L.marker([facility.lat, facility.lon], { icon: icon(category, style.color, isClosest, offset), title, alt: title,
          zIndexOffset: isClosest ? 1100 : 300, bubblingMouseEvents: false })
          .bindTooltip(textNode(isClosest ? `Closest ${closestLabel} · ${parkingDistance(closest!.distanceKm)} from A` : title),
            isClosest ? { permanent: true, direction: "bottom", offset: [offset, 18] } : {})
          .bindPopup(popup(facility, category)).addTo(layer);
      };
      for (const group of groups.slice(0, 1000)) {
        if (group.facilities.length === 1) { drawPoint(group.facilities[0], false); continue; }
        const title = `${group.facilities.length} ${label.toLowerCase()} records · ${zoomGroups ? "zoom in to explore" : "inspect locations, floors and sources"}`;
        const marker = L.marker([group.lat, group.lon], { icon: icon(category, service ? AMENITY_STYLES[service].color : AMENITY_STYLES[category === "water" ? "waterUnknown" : "toiletUnknown"].color, false, 0, group.facilities.length),
          title, alt: title, bubblingMouseEvents: false, zIndexOffset: 300 })
          .bindTooltip(textNode(title)).addTo(layer);
        if (zoomGroups) marker.on("click", () => map.fitBounds(L.latLngBounds(group.facilities.map(f => [f.lat, f.lon])), { padding: [60, 100], maxZoom: 17 }));
        else {
          const content = document.createElement("div");
          content.append(textNode("Nearby source records may describe different floors or the same facility."));
          for (const facility of group.facilities.slice(0, 50)) {
            const details = document.createElement("details"), summary = document.createElement("summary");
            summary.textContent = [facility.name, locationSummary(facility), amenityStyle(facility, category, kinds).label].filter(Boolean).join(" · ");
            details.append(summary, popup(facility, category)); content.append(details);
          }
          if (group.facilities.length > 50) content.append(textNode("Zoom in to separate more records."));
          marker.bindPopup(content, { maxHeight: 350, maxWidth: 360 });
        }
      }
      if (closest) drawPoint(closest.facility, true);
      setMapNote(limited ? "Zoom in to see all markers in this area." : service && zoom < 17 ? "Numbered markers group nearby places. Select a group to zoom in." : !alongJourney && zoom < 13 ? "Zoom in to see local points. Closest searches all eligible records at any zoom." : "");
    };
    draw(); map.on("moveend zoomend", draw);
    return () => { map.off("moveend zoomend", draw); layer.remove(); };
  }, [map, visible, category, closest, alongJourney, sharedCategories, label, service, closestLabel, kinds]);

  const legend = category === "water" ? [AMENITY_STYLES.drink, AMENITY_STYLES.nonDrink, AMENITY_STYLES.restricted, AMENITY_STYLES.waterUnknown]
    : service ? [AMENITY_STYLES[service], AMENITY_STYLES.restricted] : [AMENITY_STYLES.public, AMENITY_STYLES.restricted, AMENITY_STYLES.toiletUnknown];
  return <section id={`${category}-panel`} className="parking-panel amenity-panel" aria-label={label}>
    <div className="amenity-panel-heading"><h3>{label}</h3><button type="button" disabled={!origin || visible.length === 0}
      onClick={() => { onActivate(); setRequest(value => ({ scope: scopeKey, serial: (value?.serial ?? 0) + 1 })); }}>
      {`Find closest ${closestLabel}`}</button></div>
    {service && kinds && onKinds && <fieldset className="service-filters"><legend>Show types</legend>
      {SERVICE_FILTERS[service].map(item => <label key={item.kind}><input type="checkbox" checked={kinds.includes(item.kind)}
        onChange={e => onKinds(e.target.checked ? [...kinds, item.kind] : kinds.filter(k => k !== item.kind))} />{item.label}</label>)}
    </fieldset>}
    {category === "water" && <label className="service-filters"><input type="checkbox" checked={includeTopographicWater}
      onChange={event => onTopographicWater(event.target.checked)} /> Show topographic fountains and springs (drinkability unknown)</label>}
    <ul className="parking-legend" aria-label={`${label} colours`}>
      {legend.map(style => <li key={style.label}><b className={`amenity-badge amenity-${category}`} style={{ backgroundColor: style.color }} aria-hidden="true">
        <AmenityGlyph category={category} /></b>{style.label}</li>)}
    </ul>
    <div className="parking-result amenity-result" role="status" aria-live="polite">
      {loading && <p>Loading OpenStreetMap {service ?? "water and toilet"} data…{visible.length > 0 && " Closest uses the records currently available."}</p>}
      {error && <p>{error.message} <button type="button" onClick={retry}>Retry loading</button></p>}
      {error && visible.length > 0 && <p>Some selected data is missing. Closest searches only the loaded records.</p>}
      {sourceLoads.some(l => l.status === "idle" || l.status === "loading") && <p>Additional sources are loading. Closest uses the records currently available.</p>}
      {sourceLoads.some(l => l.status === "error") && <p>Some additional sources could not be loaded. Closest searches only the loaded records; see source details below.</p>}
      {error && ["session", "access", "network"].includes(error.code) && <p><a href="/" target="_blank" rel="noreferrer">Open planner in its own tab</a></p>}
      {(data || visible.length > 0) && <p>{visible.length.toLocaleString("en-GB")} loaded {category === "water" ? "water points" : category === "toilets" ? "toilet records" : "matching places"}{alongJourney ? ` within about ${radius} m of the selected paths and journey endpoints/stops` : " across the available sources"}.</p>}
      {alongJourney && scope?.incomplete && <p>Some sections have no confirmed street path; only their known endpoints are searched.</p>}
      {data && !loading && visible.length === 0 && <p>No listed {category === "water" ? "water points" : category === "toilets" ? "toilets" : "matching places"} found{alongJourney ? " along this journey. Try a wider route distance or explore the wider map" : " in the loaded data"}.</p>}
      {service && kinds?.length === 0 && <p>Select at least one type above to show places.</p>}
      {!origin && <p>Select a starting point A to find the closest.</p>}
      {mapNote && <p>{mapNote}</p>}
      {active && request?.scope === scopeKey && origin && !closest && <p>No eligible {closestLabel} found in this set. Explicit restrictions and unavailable facilities are excluded from closest results{category === "water" ? "; unconfirmed and non-drinking water are excluded too" : ""}.</p>}
      {closest && origin && <>
        <span className="parking-result-label">Closest {closestLabel}{alongJourney ? " along this journey" : ""} to A</span>
        <strong className="parking-result-name">{closest.facility.name}</strong>
        {locationSummary(closest.facility) && <p><b>{locationSummary(closest.facility)}</b></p>}
        {closest.facility.location?.directions && <p>{closest.facility.location.directions}</p>}
        <p><b>{parkingDistance(closest.distanceKm)}</b> straight-line from {origin.label}. Entrance and detour not checked.</p>
        <p>{amenityAccess(closest.facility, category)}. Opening at arrival has not been checked.</p>
        <details><summary>Location, sources and access</summary><ul className="amenity-details">{amenityDetails(closest.facility, category).map((line, i) => <li key={i}>{line}</li>)}</ul></details>
        {service && <div className="service-contact-links">{serviceLinks(closest.facility.tags).map(link => <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>}
        <div className="service-contact-links">{[...amenityLocationLinks(closest.facility), ...amenitySourceLinks(closest.facility)].map((link, i) => <a key={i} href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>)}</div>
      </>}
    </div>
    <div className="parking-source">
      <p><a href={OSM_COPYRIGHT} target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
        {data ? <> · downloaded {new Date(data.fetchedAt).toLocaleDateString("en-GB")}{data.stale && " · showing older data after a failed refresh"}</> : loading ? " · loading" : " · not loaded"}</p>
      {facilities.some(f => f.id.startsWith("local:")) && <p>Includes reviewed additions. User reports and approximate building locations are labelled in each place’s details; they are not on-site verification.</p>}
      {facilities.some(f => f.additionalSources?.some(s => s.kind === "document")) && <p>Some locations include additional document sources and plan links. Their review dates are shown in the details.</p>}
      {([...new Set(sourceLoads.map(l => l.provider))]).map(provider => {
        const jobs = sourceLoads.filter(l => l.provider === provider), ready = jobs.filter(l => l.status === "ready"), failed = jobs.filter(l => l.status === "error");
        const count = ready.reduce((n, l) => n + (l.data?.facilities.filter(f => f.categories.includes(category)).length ?? 0), 0);
        return <div key={provider}><p><a href={FACILITY_SOURCES[provider].url} target="_blank" rel="noreferrer">{FACILITY_SOURCES[provider].label}</a>
          {` · ${ready.length}/${jobs.length} feeds loaded · ${count} ${category} records`}{jobs.some(l => l.data?.stale) && " · refresh failed; showing older data"}</p>
          <p>{FACILITY_SOURCES[provider].scope}</p>
          {failed.length > 0 && <details><summary>{failed.length} unavailable feeds</summary><ul>{failed.map(l => <li key={l.key}>{l.label}: {l.error}</li>)}</ul>
            <button type="button" onClick={() => retrySource(provider)}>Retry missing sources</button></details>}
        </div>;
      })}
      <p>{category === "water" ? "Mapped water information is not a live quality or flow check; follow local signs. " : "Access, fees and opening hours can change. "}Coverage is incomplete; records from different sources may overlap. Closest excludes known closures and restricted entry{service ? "; ordinary customer access is included" : ""}; missing access information stays unknown. Distances use points/area centres, not verified entrances. Your journey stays unchanged.</p>
    </div>
  </section>;
}
