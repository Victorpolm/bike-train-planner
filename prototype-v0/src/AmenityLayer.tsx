import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { OSM_COPYRIGHT, parkingDistance } from "./bikeParking.ts";
import { parkingAlongRoute, parkingIndex, PARKING_CORRIDOR_METRES, type ParkingRouteScope } from "./parkingMap.ts";
import { amenityAccess, amenityDetails, amenityStyle, closestAmenity, AMENITY_STYLES, type Amenity, type AmenityCategory, type AmenityData } from "./osmAmenities.ts";
import type { AmenityLoadError } from "./amenityClient.ts";
import type { Place } from "./routing.ts";

const EMPTY: Amenity[] = [];
const DROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" fill="currentColor"/></svg>';
export function WaterGlyph() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-13Z" fill="currentColor" /></svg>; }
function icon(category: AmenityCategory, color: string, closest: boolean, offset: number) {
  const badge = document.createElement("span"); badge.className = `amenity-badge amenity-${category}`;
  badge.style.backgroundColor = color; badge.setAttribute("aria-hidden", "true");
  if (category === "water") badge.innerHTML = DROP; else badge.textContent = "WC";
  const size = closest ? 36 : 32;
  return L.divIcon({ className: `amenity-marker${closest ? " amenity-marker-closest" : ""}`, html: badge,
    iconSize: [size, size], iconAnchor: [size / 2 - offset, size / 2], popupAnchor: [offset, -size / 2] });
}
function textNode(text: string) { const node = document.createElement("span"); node.textContent = text; return node; }
function popup(facility: Amenity, category: AmenityCategory) {
  const node = document.createElement("div"), title = document.createElement("strong"); title.textContent = facility.name; node.append(title);
  for (const line of amenityDetails(facility, category)) { const p = document.createElement("p"); p.textContent = line; node.append(p); }
  const link = document.createElement("a"); link.href = facility.url; link.textContent = "Source: © OpenStreetMap contributors";
  link.target = "_blank"; link.rel = "noreferrer"; node.append(link); return node;
}

type Props = { category: AmenityCategory; map: L.Map | null; origin: Place | null; data?: AmenityData;
  loading: boolean; error?: AmenityLoadError; retry: () => void; scope: ParkingRouteScope | null; alongJourney: boolean;
  active: boolean; onActivate: () => void; otherLayerEnabled: boolean; onLocate: (facility: Amenity) => void };
export default function AmenityLayer({ category, map, origin, data, loading, error, retry, scope, alongJourney,
  active, onActivate, otherLayerEnabled, onLocate }: Props) {
  const label = category === "water" ? "Water fountains" : "Toilets";
  const [mapNote, setMapNote] = useState("");
  const [request, setRequest] = useState<{ scope: string; serial: number } | null>(null);
  const facilities = useMemo(() => data?.facilities.filter(f => f.categories.includes(category)) ?? EMPTY, [data, category]);
  const index = useMemo(() => parkingIndex(facilities), [facilities]);
  const visible = useMemo(() => alongJourney && scope ? parkingAlongRoute(index, scope) : facilities, [alongJourney, scope, index, facilities]);
  const scopeKey = JSON.stringify([scope?.key, alongJourney]);
  const closest = useMemo(() => active && request?.scope === scopeKey ? closestAmenity(visible, origin, category) : null,
    [active, request, scopeKey, visible, origin?.lat, origin?.lon, category]);
  const locate = useRef(onLocate); locate.current = onLocate;
  useEffect(() => { if (closest && origin) locate.current(closest.facility); }, [closest, origin?.lat, origin?.lon]);

  useEffect(() => {
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    const draw = () => {
      layer.clearLayers();
      const bounds = map.getBounds().pad(.1), zoom = map.getZoom();
      let count = 0, limited = false;
      for (const facility of visible) {
        const isClosest = facility.id === closest?.facility.id;
        if (!isClosest && ((!alongJourney && zoom < 13) || !bounds.contains([facility.lat, facility.lon]))) continue;
        if (!isClosest && count >= 1000) { limited = true; continue; }
        count++;
        const style = amenityStyle(facility, category);
        // Two services on one OSM object retain one source identity; offset their
        // symbols only when both layers are visible so either remains clickable.
        const offset = otherLayerEnabled && facility.categories.length === 2 ? category === "water" ? -15 : 15 : 0;
        const title = `${label}: ${facility.name} · ${style.label}`;
        L.marker([facility.lat, facility.lon], { icon: icon(category, style.color, isClosest, offset), title, alt: title,
          zIndexOffset: isClosest ? 1100 : 300, bubblingMouseEvents: false })
          .bindTooltip(textNode(isClosest ? `Closest ${category === "water" ? "mapped drinking water" : "eligible toilet"} · ${parkingDistance(closest!.distanceKm)} from A` : title),
            isClosest ? { permanent: true, direction: "bottom", offset: [offset, 18] } : {})
          .bindPopup(popup(facility, category)).addTo(layer);
      }
      setMapNote(limited ? "Zoom in to see all markers in this area." : !alongJourney && zoom < 13 ? "Zoom in to see local points. Closest searches all eligible records at any zoom." : "");
    };
    draw(); map.on("moveend zoomend", draw);
    return () => { map.off("moveend zoomend", draw); layer.remove(); };
  }, [map, visible, category, closest, alongJourney, otherLayerEnabled, label]);

  const legend = category === "water" ? [AMENITY_STYLES.drink, AMENITY_STYLES.nonDrink, AMENITY_STYLES.restricted, AMENITY_STYLES.waterUnknown]
    : [AMENITY_STYLES.public, AMENITY_STYLES.restricted, AMENITY_STYLES.toiletUnknown];
  return <section id={`${category}-panel`} className="parking-panel amenity-panel" aria-label={label}>
    <div className="amenity-panel-heading"><h3>{label}</h3><button type="button" disabled={!origin || loading || visible.length === 0}
      onClick={() => { onActivate(); setRequest(value => ({ scope: scopeKey, serial: (value?.serial ?? 0) + 1 })); }}>
      {category === "water" ? "Find closest drinking water" : "Find closest toilet"}</button></div>
    <ul className="parking-legend" aria-label={`${label} colours`}>
      {legend.map(style => <li key={style.label}><b className={`amenity-badge amenity-${category}`} style={{ backgroundColor: style.color }} aria-hidden="true">
        {category === "water" ? <WaterGlyph /> : "WC"}</b>{style.label}</li>)}
    </ul>
    <div className="parking-result amenity-result" role="status" aria-live="polite">
      {loading && <p>Loading OpenStreetMap water and toilet data…</p>}
      {error && <p>{error.message} <button type="button" onClick={retry}>Retry loading</button></p>}
      {error && ["session", "access", "network"].includes(error.code) && <p><a href="/" target="_blank" rel="noreferrer">Open planner in its own tab</a></p>}
      {data && <p>{visible.length.toLocaleString("en-GB")} loaded {category === "water" ? "water points" : "toilet records"}{alongJourney ? ` within about ${PARKING_CORRIDOR_METRES} m of the selected paths and journey endpoints/stops` : " in the Swiss regional extract"}.</p>}
      {alongJourney && scope?.incomplete && <p>Some sections have no confirmed street path; only their known endpoints are searched.</p>}
      {data && !loading && visible.length === 0 && <p>No mapped {category === "water" ? "water points" : "toilets"} found{alongJourney ? " along this journey. Uncheck “Along selected journey” to explore the wider map" : " in the loaded data"}.</p>}
      {!origin && <p>Select a starting point A to find the closest.</p>}
      {mapNote && <p>{mapNote}</p>}
      {active && request?.scope === scopeKey && origin && !closest && <p>No eligible {category === "water" ? "mapped drinking water" : "toilet"} found in this set. Explicit restrictions and unavailable facilities are excluded from closest results{category === "water" ? "; unconfirmed and non-drinking water are excluded too" : ""}.</p>}
      {closest && origin && <>
        <span className="parking-result-label">Closest {category === "water" ? "mapped drinking water" : "eligible toilet"}{alongJourney ? " along this journey" : ""} to A</span>
        <strong className="parking-result-name">{closest.facility.name}</strong>
        <p><b>{parkingDistance(closest.distanceKm)}</b> straight-line from {origin.label}. Entrance and detour not checked.</p>
        <p>{amenityAccess(closest.facility, category)}. Opening at arrival has not been checked.</p>
        <details><summary>Mapped details and access</summary><ul className="amenity-details">{amenityDetails(closest.facility, category).map((line, i) => <li key={i}>{line}</li>)}</ul></details>
        <a href={closest.facility.url} target="_blank" rel="noreferrer">View source and mapped details</a>
      </>}
    </div>
    <div className="parking-source">
      <p><a href={OSM_COPYRIGHT} target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
        {data && <> · downloaded {new Date(data.fetchedAt).toLocaleDateString("en-GB")}{data.stale && " · showing older data after a failed refresh"}</>}</p>
      <p>{category === "water" ? "Mapped water information is not a live quality or flow check; follow local signs. " : "Access, fees and opening hours can change. "}Coverage is incomplete. Closest excludes explicit restrictions; missing access information stays unknown. Distances use points/area centres, not verified entrances. Your journey stays unchanged.</p>
    </div>
  </section>;
}
