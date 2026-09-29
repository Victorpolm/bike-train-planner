import { closestBikeParking, parkingAccess, parkingDetails, parkingDistance, PARKING_SOURCE, OSM_COPYRIGHT } from "./bikeParking";
import { useBikeParking } from "./useBikeParking";
import { useAmenities } from "./useAmenities";
import AmenityLayer, { AmenityGlyph, WaterGlyph } from "./AmenityLayer";
import { mergeFoodData, SERVICE_FILTERS, type ServiceKind } from "./osmServices";
import type { AmenityCategory } from "./osmAmenities";
import { parkingAlongRoute, parkingIndex, parkingRouteScope, parkingStyle, PARKING_CORRIDOR_METRES, PARKING_LEGEND } from "./parkingMap";
import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { formatMinutes, type CyclingComparison, type Journey, type Place, type Point } from "./routing";
import { journeyStops, type ExploredStop } from "./mapData";
import { pointAlong, type CyclingRoute } from "./cycling";
import { sectionGeometry } from "./swisstopo";
import { travelModeLabel } from "./cyclingTerrain";

type MapViewProps = {
  origin: Place | null;
  destination: Place | null;
  waypoints: { id: string; place: Place; number: number }[];
  editingDisabled: boolean;
  canAddWaypoint: boolean;
  onSelectPoint: (target: "origin" | "destination" | "via", point: Point) => void;
  onMovePoint: (id: string, point: Point) => void;
  stops: ExploredStop[];
  selectedJourney: Journey | null;
  cycling: CyclingComparison | null;
  bikeOnlySelected: boolean;
  cycleFocus: { route: CyclingRoute; distanceM: number } | null;
  onCycleFocus: (routeId: string, distanceM: number) => void;
};

const COLORS = { origin: "#d66b3d", destination: "#195e4d", cycle: "#195e4d", transit: "#2f557f", bikeOnly: "#76558e", walk: "#647269" };
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" });

function textNode(text: string) {
  const node = document.createElement("span"); node.textContent = text; return node;
}
function popup(title: string, lines: string[]) {
  const content = document.createElement("div");
  const heading = document.createElement("strong"); heading.textContent = title; content.append(heading);
  for (const line of lines) {
    const p = document.createElement("p"); p.textContent = line; content.append(p);
  }
  return content;
}
function markerIcon(color: string, label: string, offset = L.point(0, 0)) {
  return L.divIcon({
    className: "custom-marker",
    html: '<span style="--marker-color:' + color + '">' + label + "</span>",
    iconSize: [34, 34], iconAnchor: [17 - offset.x, 17 - offset.y], popupAnchor: [offset.x, offset.y - 17],
  });
}
function parkingIcon(color: string, closest = false) {
  const badge = document.createElement("span");
  badge.className = "parking-badge"; badge.style.backgroundColor = color; badge.textContent = "P";
  badge.setAttribute("aria-hidden", "true");
  const size = closest ? 36 : 28;
  return L.divIcon({ className: `parking-marker${closest ? " parking-marker-closest" : ""}`, html: badge,
    iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
}
function fitMap(map: L.Map, bounds: L.LatLngBounds) {
  // Reserve room for the legend and displaced stop labels on mobile.
  const controls = map.getContainer().parentElement?.querySelector(".map-controls")?.getBoundingClientRect().height ?? 0;
  map.fitBounds(bounds, { paddingTopLeft: [48, controls + 34], paddingBottomRight: [56, 84], maxZoom: 14, animate: false });
}

export default function MapView({
  origin, destination, waypoints, editingDisabled, canAddWaypoint, onSelectPoint, onMovePoint,
  stops, selectedJourney, cycling, bikeOnlySelected, cycleFocus, onCycleFocus,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const focusLayerRef = useRef<L.LayerGroup | null>(null);
  const allBoundsRef = useRef<L.LatLngBounds | null>(null);
  const visibleBoundsRef = useRef<L.LatLngBounds | null>(null);
  const redrawPinsRef = useRef<(() => void) | null>(null);
  const fittedRef = useRef("");
  const skipFitRef = useRef(false);
  const pickerRef = useRef<((point: L.LatLng) => void) | null>(null);
  const handlers = useRef({ editingDisabled, canAddWaypoint, onSelectPoint, onMovePoint, onCycleFocus });
  handlers.current = { editingDisabled, canAddWaypoint, onSelectPoint, onMovePoint, onCycleFocus };
  const [showStops, setShowStops] = useState(true);
  const [showParking, setShowParking] = useState(false);
  const [showWater, setShowWater] = useState(false);
  const [showToilets, setShowToilets] = useState(false);
  const [showRepairs, setShowRepairs] = useState(false);
  const [showFood, setShowFood] = useState(false);
  const [repairKinds, setRepairKinds] = useState<ServiceKind[]>(() => SERVICE_FILTERS.repairs.filter(item => item.default).map(item => item.kind));
  const [foodKinds, setFoodKinds] = useState<ServiceKind[]>(() => SERVICE_FILTERS.food.filter(item => item.default).map(item => item.kind));
  const repairs = useAmenities(showRepairs, "repairs");
  const quickFood = useAmenities(showFood, "food");
  const showDining = foodKinds.some(kind => kind === "cafe" || kind === "restaurant");
  const dining = useAmenities(showFood && showDining, "food-dining");
  const foodData = useMemo(() => mergeFoodData(quickFood.data, showDining ? dining.data : undefined), [quickFood.data, dining.data, showDining]);
  const food = { data: foodData, loading: quickFood.loading || showDining && dining.loading,
    error: quickFood.error ?? (showDining ? dining.error : undefined),
    retry: () => { if (quickFood.error) quickFood.retry(); if (showDining && dining.error) dining.retry(); } };
  const [routeRadius, setRouteRadius] = useState(PARKING_CORRIDOR_METRES);
  const [activeAmenity, setActiveAmenity] = useState<AmenityCategory | null>(null);
  const amenities = useAmenities(showWater || showToilets);
  const sharedCategories = useMemo(() => {
    const result = new Map<string, AmenityCategory[]>();
    for (const [enabled, data] of [[showWater || showToilets, amenities.data], [showRepairs, repairs.data], [showFood, food.data]] as const) {
      if (!enabled || !data) continue;
      for (const facility of data.facilities) {
        const categories = result.get(facility.id) ?? [];
        for (const category of facility.categories) {
          if (category === "water" && !showWater || category === "toilets" && !showToilets) continue;
          if (!categories.includes(category)) categories.push(category);
        }
        result.set(facility.id, categories);
      }
    }
    return result;
  }, [showWater, showToilets, showRepairs, showFood, amenities.data, repairs.data, food.data]);
  const { loads: parkingLoads, datasets: parkingDatasets, facilities: parkingFacilities, loading: parkingLoading, retry: retryParking } = useBikeParking(showParking);
  const [parkingMapNote, setParkingMapNote] = useState("");
  const [onlyAlongJourney, setOnlyAlongJourney] = useState(true);
  const parkingRoute = useMemo(() => parkingRouteScope({ journey: selectedJourney, cycling, bikeOnlySelected,
    origin, destination, waypoints: waypoints.map(w => w.place) }), [selectedJourney, cycling, bikeOnlySelected, origin, destination, waypoints]);
  const alongJourney = !!parkingRoute && onlyAlongJourney;
  const indexedParking = useMemo(() => parkingIndex(parkingFacilities), [parkingFacilities]);
  const visibleParking = useMemo(() => alongJourney && parkingRoute ? parkingAlongRoute(indexedParking, parkingRoute, routeRadius) : parkingFacilities,
    [alongJourney, parkingRoute, indexedParking, parkingFacilities, routeRadius]);
  // A new journey must not retain an old closest pin or override the route fit.
  const parkingScopeKey = JSON.stringify([parkingRoute?.key, alongJourney, routeRadius]);
  const [closestRequest, setClosestRequest] = useState<{ scope: string; serial: number } | null>(null);
  const closestParking = useMemo(() => showParking && closestRequest?.scope === parkingScopeKey
    ? closestBikeParking(visibleParking, origin) : null,
  [showParking, closestRequest, parkingScopeKey, visibleParking, origin?.lat, origin?.lon]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showParking) return;
    const layer = L.layerGroup().addTo(map);
    const draw = () => {
      layer.clearLayers();
      let count = 0, limited = false;
      const bounds = map.getBounds().pad(.1), zoom = map.getZoom();
      for (const facility of visibleParking) {
        const isClosest = facility.id === closestParking?.facility.id;
        const osmOnly = facility.sources?.every(ref => ref.provider === "osm");
        if (!isClosest && ((!alongJourney && zoom < (osmOnly ? 13 : 10)) || !bounds.contains([facility.lat, facility.lon]))) continue;
        if (!isClosest && count >= 1500) { limited = true; continue; }
        count++;
        const style = parkingStyle(facility);
        const content = popup(facility.name, [style.detail, ...parkingDetails(facility)]);
        if (facility.url) { const a = document.createElement("a"); a.href = facility.url; a.textContent = "Facility information"; a.target = "_blank"; a.rel = "noreferrer"; content.append(a); }
        for (const source of facility.sources ?? []) {
          const p = document.createElement("p"), link = document.createElement("a");
          link.href = source.url; link.textContent = source.provider === "osm" ? "Source: © OpenStreetMap contributors" : "Source: opentransportdata.swiss";
          link.target = "_blank"; link.rel = "noreferrer"; p.append(link); content.append(p);
        }
        if (isClosest) {
          L.marker([facility.lat, facility.lon], { icon: parkingIcon(style.color, true),
            title: `Closest listed bicycle parking: ${facility.name} · ${style.label}`, alt: `Closest listed bicycle parking: ${facility.name} · ${style.label}`, zIndexOffset: 1100 })
            .bindTooltip(textNode(`Closest parking · ${parkingDistance(closestParking!.distanceKm)} straight-line`), { permanent: true, direction: "bottom", offset: [0, 18] })
            .bindPopup(content).addTo(layer);
        } else {
          L.marker([facility.lat, facility.lon], { icon: parkingIcon(style.color), zIndexOffset: 250,
            title: `Bicycle parking: ${facility.name} · ${style.label}`, alt: `Bicycle parking: ${facility.name} · ${style.label}`, bubblingMouseEvents: false })
            .bindTooltip(textNode(`${facility.name} · ${style.label}`)).bindPopup(content).addTo(layer);
        }
      }
      setParkingMapNote(limited ? "Zoom in to see all parking pins in this area." : !alongJourney && zoom < 13 ? "Zoom in to see local OpenStreetMap parking. Find closest parking searches all loaded records at any zoom." : "");
    };
    draw(); map.on("moveend zoomend", draw);
    return () => { map.off("moveend zoomend", draw); layer.remove(); };
  }, [showParking, visibleParking, closestParking, alongJourney]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView([46.8182, 8.2275], 8);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map; layerRef.current = L.layerGroup().addTo(map); focusLayerRef.current = L.layerGroup().addTo(map);
    const choosePoint = (point: L.LatLng) => {
      if (handlers.current.editingDisabled) return;
      const content = popup("Choose this location", [`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`]);
      content.className = "map-location-picker";
      for (const [target, label] of [["origin", "Start here"], ["destination", "Finish here"], ["via", "Add intermediate stop"]] as const) {
        const button = document.createElement("button"); button.type = "button"; button.textContent = label;
        button.disabled = target === "via" && !handlers.current.canAddWaypoint;
        button.onclick = () => {
          if (handlers.current.editingDisabled) return;
          skipFitRef.current = true; map.closePopup();
          handlers.current.onSelectPoint(target, { lat: point.lat, lon: point.lng });
        };
        content.append(button);
      }
      L.DomEvent.disableClickPropagation(content);
      L.popup({ maxWidth: 260, className: "location-popup" }).setLatLng(point).setContent(content).openOn(map);
    };
    pickerRef.current = choosePoint;
    map.on("click", (event: L.LeafletMouseEvent) => choosePoint(event.latlng.wrap()));
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      if (visibleBoundsRef.current?.isValid()) fitMap(map, visibleBoundsRef.current);
      redrawPinsRef.current?.();
    });
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; pickerRef.current = null; fittedRef.current = ""; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = L.latLngBounds([]), allBounds = L.latLngBounds([]);
    const selectedStops = selectedJourney ? journeyStops(selectedJourney) : [];
    const selectedIds = new Set(selectedStops.map(s => s.id));
    if (editingDisabled) map.closePopup();
    const addEndpoint = (id: string, place: Place, color: string, label: string) => {
      const point: L.LatLngExpression = [place.lat, place.lon];
      const title = id === "origin" ? "Start" : id === "destination" ? "Finish" : `Intermediate stop ${label.slice(1)}`;
      const marker = L.marker(point, { icon: markerIcon(color, label), title: `${title}: ${place.label}`,
        alt: `${title}: ${place.label}`, zIndexOffset: 1000, draggable: !editingDisabled, autoPan: true });
      marker.bindTooltip(textNode(`${title} · ${place.label}`)).bindPopup(popup(title,
        [place.label, editingDisabled ? "Stop the search to move this location." : "Drag this marker to move the location."])).addTo(layer);
      marker.on("dragend", () => {
        const position = marker.getLatLng().wrap();
        skipFitRef.current = true;
        handlers.current.onMovePoint(id, { lat: position.lat, lon: position.lng });
      });
      bounds.extend(point); allBounds.extend(point);
    };
    if (origin) addEndpoint("origin", origin, COLORS.origin, "A");
    waypoints.forEach(({ id, place, number }) => addEndpoint(id, place, COLORS.bikeOnly, `V${number}`));
    if (destination) addEndpoint("destination", destination, COLORS.destination, "B");
    const drawCycling = (route: CyclingRoute | undefined, color: string, title: string, active: boolean) => {
      if (!route?.points.length) return;
      const coordinates = route.points.map(p => [p.lat, p.lon] as [number, number]);
      const line = L.polyline(coordinates, { color, weight: active ? 5 : 2, opacity: active ? .9 : .25,
        interactive: active, bubblingMouseEvents: false }).bindTooltip(textNode(`${title} · ${route.distanceKm.toFixed(1)} km · ≈ ${formatMinutes(route.minutes)}`)).addTo(layer);
      if (active) {
        coordinates.forEach(p => bounds.extend(p));
        const inspect = (event: L.LeafletMouseEvent) => {
          const position = map.latLngToLayerPoint(event.latlng), stride = Math.max(1, Math.ceil(route.points.length / 1500));
          let best = 0, distance = Infinity;
          for (let i = 0; i < route.points.length; i += stride) {
            const p = route.points[i], d = map.latLngToLayerPoint([p.lat, p.lon]).distanceTo(position);
            if (d < distance) { distance = d; best = i; }
          }
          const index = best;
          for (let i = Math.max(0, index - stride); i < Math.min(route.points.length, index + stride + 1); i++) {
            const p = route.points[i], d = map.latLngToLayerPoint([p.lat, p.lon]).distanceTo(position);
            if (d < distance) { distance = d; best = i; }
          }
          handlers.current.onCycleFocus(route.id, route.points[best].distanceM);
        };
        line.on("mousemove", inspect); line.on("click", inspect);
        for (const steep of route.steep) {
          const a = pointAlong(route.points, steep.startM)!, b = pointAlong(route.points, steep.endM)!;
          const section = [a, ...route.points.filter(p => p.distanceM > steep.startM && p.distanceM < steep.endM), b];
          L.polyline(section.map(p => [p.lat, p.lon]), { color: steep.gradePercent > 0 ? "#c15a17" : "#287caf", weight: 6, opacity: .85, interactive: false }).addTo(layer);
        }
        for (const section of route.sections.filter(s => s.mode && s.mode !== "cycle")) {
          const geometry = sectionGeometry(route, section.startM, section.endM);
          if (geometry.length < 2) continue;
          L.polyline(geometry.map(p => [p.lat, p.lon]), { color: section.mode === "carry" ? "#a63c29" : "#b27212",
            weight: 7, dashArray: section.mode === "carry" ? "2 7" : "9 5", opacity: .95, bubblingMouseEvents: false })
            .bindTooltip(textNode(travelModeLabel[section.mode!] + " · " + (section.reasons ?? []).join(" "))).addTo(layer);
        }
        for (const [a, b] of [[route.from, route.points[0]], [route.points.at(-1)!, route.to]]) {
          L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: COLORS.walk, weight: 3, dashArray: "2 6", interactive: false }).addTo(layer);
        }
      }
      coordinates.forEach(p => allBounds.extend(p));
    };
    const pinLayer = L.layerGroup().addTo(layer);
    const drawPins = () => {
      pinLayer.clearLayers();
      const controlsBottom = (map.getContainer().parentElement?.querySelector(".map-controls")?.getBoundingClientRect().height ?? 0) + 32;
      const placed = [origin, ...waypoints.map(w => w.place), destination].filter((p): p is Place => p !== null)
        .map(p => map.latLngToLayerPoint([p.lat, p.lon]));
      for (const stop of selectedStops) {
        const anchor = map.latLngToLayerPoint([stop.lat, stop.lon]);
        const screen = map.latLngToContainerPoint([stop.lat, stop.lon]), size = map.getSize();
        let offset = L.point(0, 0);
        // Separate labels in screen space; leader lines preserve exact geography.
        const offsets = [L.point(0, 0)];
        for (let radius = 1; radius <= 3; radius++) {
          for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
            if (Math.max(Math.abs(x), Math.abs(y)) === radius) offsets.push(L.point(x * 44, y * 44));
          }
        }
        offset = offsets.find(p => screen.x + p.x >= 20 && screen.x + p.x <= size.x - 20
          && screen.y + p.y >= controlsBottom && screen.y + p.y <= size.y - 82
          && placed.every(other => other.distanceTo(anchor.add(p)) >= 40)) ?? offset;
        placed.push(anchor.add(offset));
        if (offset.x || offset.y) {
          L.polyline([[stop.lat, stop.lon], map.layerPointToLatLng(anchor.add(offset))],
            { color: COLORS.transit, weight: 1, opacity: .65, interactive: false }).addTo(pinLayer);
        }
        const title = stop.number + ". " + stop.name;
        const events = stop.events.map(e => e.action + " " + e.service + " · boarding " + e.boarding
          + (e.time ? " · " + clock.format(e.time) : " · time unavailable")
          + (e.platform ? " · platform " + e.platform : "") + (e.bicycle ? " · " + e.bicycle : ""));
        L.marker([stop.lat, stop.lon], {
          icon: markerIcon(COLORS.transit, String(stop.number), offset), title, alt: title, zIndexOffset: 800,
        }).bindTooltip(textNode(title)).bindPopup(popup(title, events)).addTo(pinLayer);
      }
    };

    for (const route of cycling?.routes ?? []) drawCycling(route, COLORS.bikeOnly, "Cycling only", bikeOnlySelected);

    for (const stop of stops) {
      allBounds.extend([stop.lat, stop.lon]);
      if (!showStops || selectedIds.has(stop.id)) continue;
      L.marker([stop.lat, stop.lon], {
        icon: L.divIcon({ className: "candidate-marker", html: '<span class="candidate-dot"></span>', iconSize: [28, 28], iconAnchor: [14, 14] }),
        title: "Explored stop: " + stop.name, zIndexOffset: -100,
      }).bindTooltip(textNode(stop.name)).bindPopup(popup(stop.name, [...stop.notes, "Candidate only; no bicycle-carriage permission verified."])).addTo(layer);
    }

    if (selectedJourney && origin && destination) {
      const first = selectedJourney.originStation, last = selectedJourney.destinationStation;
      if (!selectedJourney.legsIncludeEndpoints) drawCycling(first.cyclingRoute, COLORS.cycle, "Cycle to the station", true);
      bounds.extend([first.lat, first.lon]); bounds.extend([last.lat, last.lon]);
      for (const leg of selectedJourney.transitLegs) {
        if (leg.mode === "bike") { drawCycling(leg.cyclingRoute, COLORS.cycle, leg.service, true); continue; }
        const points = leg.geometry ?? [leg.fromPoint, leg.toPoint].filter((p): p is Point => !!p);
        if (points.length < 2) continue;
        const coordinates = points.map(p => [p.lat, p.lon] as [number, number]);
        L.polyline(coordinates, {
          color: leg.mode === "walk" ? COLORS.walk : COLORS.transit,
          weight: leg.mode === "transit" ? 5 : 4, dashArray: leg.mode === "transit" ? undefined : "4 7", className: "journey-line",
        }).bindTooltip(textNode(leg.service + ": " + leg.from + " → " + leg.to)).addTo(layer);
        coordinates.forEach(point => bounds.extend(point));
      }
      if (!selectedJourney.legsIncludeEndpoints) drawCycling(last.cyclingRoute, COLORS.destination, "Cycle to your destination", true);
      for (const stop of selectedStops) {
        bounds.extend([stop.lat, stop.lon]);
      }
    }

    allBounds.extend(bounds); allBoundsRef.current = allBounds;
    // Background updates must not undo a user's zoom while inspecting a stop.
    const fitKey = [origin?.lat, origin?.lon, destination?.lat, destination?.lon,
      ...waypoints.flatMap(w => [w.id, w.place.lat, w.place.lon]),
      selectedJourney?.id ?? `bike-only:${cycling?.routes?.map(r => r.id).join("|") ?? ""}`].join("|");
    if (bounds.isValid() && fittedRef.current !== fitKey) {
      visibleBoundsRef.current = bounds;
      if (!skipFitRef.current) fitMap(map, bounds);
      fittedRef.current = fitKey;
    }
    skipFitRef.current = false;
    redrawPinsRef.current = drawPins;
    drawPins(); map.on("zoomend", drawPins);
    return () => { map.off("zoomend", drawPins); redrawPinsRef.current = null; };
  }, [origin, destination, waypoints, editingDisabled, stops, selectedJourney, cycling, bikeOnlySelected, showStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !closestParking || !origin) return;
    const bounds = L.latLngBounds([[origin.lat, origin.lon], [closestParking.facility.lat, closestParking.facility.lon]]);
    visibleBoundsRef.current = bounds;
    fitMap(map, bounds);
  }, [closestParking, origin?.lat, origin?.lon]);

  useEffect(() => {
    const map = mapRef.current, layer = focusLayerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    if (!cycleFocus) return;
    const point = pointAlong(cycleFocus.route.points, cycleFocus.distanceM);
    if (!point) return;
    L.circleMarker([point.lat, point.lon], { radius: 7, color: "#fff", weight: 3, fillColor: "#b34c12", fillOpacity: 1, interactive: false })
      .bindTooltip(textNode(`${(cycleFocus.distanceM / 1000).toFixed(2)} km · ${point.elevationM === null ? "elevation unknown" : `${Math.round(point.elevationM)} m`}`), { permanent: true, direction: "top" }).addTo(layer);
    map.panInside([point.lat, point.lon], { paddingTopLeft: [55, 145], paddingBottomRight: [55, 90], animate: false });
  }, [cycleFocus]);

  return <>
    <div className="map-controls map-tools">
      <button type="button" disabled={editingDisabled} onClick={() => {
        if (mapRef.current) pickerRef.current?.(mapRef.current.getCenter());
      }}>Choose map centre</button>
      <label><input type="checkbox" checked={showStops} onChange={e => setShowStops(e.target.checked)} />Explored stops ({stops.length})</label>
      <div className="map-facility-controls" role="group" aria-label="Useful stops">
      <button type="button" className="parking-toggle" aria-pressed={showParking} aria-controls="parking-panel"
        title={showParking ? "Hide bicycle parking" : "Show bicycle parking"}
        onClick={() => { setShowParking(value => !value); setClosestRequest(null); }}>
        <span className="parking-button-icon" aria-hidden="true"><b>P</b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="5" cy="17" r="4" /><circle cx="19" cy="17" r="4" /><path d="m5 17 5-9 5 9H5m5-9h7l2 9M8 5h4m4-1h3l1 4" />
        </svg></span>Bike parking
      </button>
      <button type="button" className="amenity-toggle" aria-pressed={showWater} aria-controls="water-panel" onClick={() => setShowWater(value => !value)}>
        <WaterGlyph />Water</button>
      <button type="button" className="amenity-toggle" aria-pressed={showToilets} aria-controls="toilets-panel" onClick={() => setShowToilets(value => !value)}>
        <b aria-hidden="true">WC</b>Toilets</button>
      <button type="button" className="amenity-toggle repairs-toggle" aria-pressed={showRepairs} aria-controls="repairs-panel" onClick={() => setShowRepairs(value => !value)}>
        <AmenityGlyph category="repairs" />Repairs</button>
      <button type="button" className="amenity-toggle food-toggle" aria-pressed={showFood} aria-controls="food-panel" onClick={() => setShowFood(value => !value)}>
        <AmenityGlyph category="food" />Food</button>
      </div>
      {(showParking || showWater || showToilets || showRepairs || showFood) && parkingRoute && <label className="parking-route-toggle"><input type="checkbox" checked={onlyAlongJourney}
        onChange={e => { setOnlyAlongJourney(e.target.checked); setClosestRequest(null); }} />Along selected journey</label>}
      {(showParking || showWater || showToilets || showRepairs || showFood) && alongJourney && <label className="route-distance-control">Route distance
        <select aria-label="Distance from selected journey" value={routeRadius} onChange={e => setRouteRadius(Number(e.target.value))}>
          <option value={100}>100 m</option><option value={500}>500 m</option><option value={1000}>1 km</option>
        </select></label>}
      {showParking && <button type="button" className="parking-closest-button" disabled={!origin || parkingLoading || visibleParking.length === 0}
        onClick={() => { setActiveAmenity(null); setClosestRequest(value => ({ scope: parkingScopeKey, serial: (value?.serial ?? 0) + 1 })); }}>Find closest parking</button>}
      <button type="button" disabled={!stops.length} onClick={() => {
        setShowStops(true);
        if (allBoundsRef.current?.isValid() && mapRef.current) {
          visibleBoundsRef.current = allBoundsRef.current;
          fitMap(mapRef.current, allBoundsRef.current);
        }
      }}>Fit all stops</button>
      <div className="map-instruction">{editingDisabled ? "Stop the search to edit locations." : "Tap the map to choose locations. Drag A, B or a stop to move it."}</div>
    </div>
    <div className="map-shell">
    <div ref={containerRef} className="map" aria-label={bikeOnlySelected ? "Cycling-only estimate map" : "Selected journey and explored stops map"} />
    <div className="map-legend">
      <span><i className="legend-bike-only" />Cycling only</span>
      <span><i className="legend-bike" />Cycling leg</span>
      <span><i className="legend-train" />Transit</span>
      <span><i className="legend-walk" />Walking</span>
      <span><i className="legend-push" />Push bicycle</span>
      <span><i className="legend-carry" />Carry bicycle</span>
      <span><i className="legend-climb" />Steep climb</span>
      <span><i className="legend-descent" />Steep descent</span>
      <span><i className="legend-stop" />Explored stop</span>
      {showParking && <span><b className="legend-parking" aria-hidden="true">P</b>Bike parking</span>}
      {showWater && <span><span className="legend-water"><WaterGlyph /></span>Water</span>}
      {showToilets && <span><b className="legend-parking" aria-hidden="true">WC</b>Toilets</span>}
      {showRepairs && <span><span className="legend-service legend-repairs"><AmenityGlyph category="repairs" /></span>Repairs</span>}
      {showFood && <span><span className="legend-service legend-food"><AmenityGlyph category="food" /></span>Food</span>}
      <span><b className="legend-pin">1</b>Board / alight</span>
    </div>
  </div>
    {showParking && <section id="parking-panel" className="parking-panel" aria-label="Bicycle parking">
      <ul className="parking-legend" aria-label="Parking colours by mapped equipment">
        {PARKING_LEGEND.map(style => <li key={style.label}><b className="parking-badge" style={{ backgroundColor: style.color }} aria-hidden="true">P</b>{style.label}</li>)}
      </ul>
      <p className="parking-equipment-note">Colours describe mapped equipment. Access restrictions and theft protection need a separate check.</p>
      <div className="parking-result" role="status" aria-live="polite">
        {alongJourney && <p><b>{visibleParking.length.toLocaleString("en-GB")}</b> loaded parking records within about {routeRadius} m of the selected cycling/walking paths, start, finish and boarding/alighting points. Uncheck “Along selected journey” to show all parking.</p>}
        {alongJourney && parkingRoute?.incomplete && <p>Some sections have no confirmed street path. Parking near their known endpoints is included; the gaps are not searched.</p>}
        {parkingLoading && <p>Loading {parkingLoads.osm.status === "loading" ? "OpenStreetMap bicycle parking" : "bicycle parking"}…</p>}
        {Object.values(parkingLoads).some(load => load.status === "error") && <p>{parkingFacilities.length ? "Some parking data could not be loaded. Closest results use only loaded sources." : "Parking data could not be loaded. See the reason for each source below."} <button type="button" onClick={retryParking}>Retry missing sources</button></p>}
        {Object.values(parkingLoads).some(load => load.error?.code === "session" || load.error?.code === "access" || load.error?.code === "network") && <p><a href="/" target="_blank" rel="noreferrer">Open planner in its own tab</a></p>}
        {!origin && <p>Select a starting point in the From field or choose Start here on the map.</p>}
        {!parkingLoading && parkingDatasets.length > 0 && parkingFacilities.length === 0 && <p>No bicycle parking was found in the loaded sources.</p>}
        {!parkingLoading && parkingFacilities.length > 0 && alongJourney && visibleParking.length === 0 && <p>No loaded parking was found along this journey. Uncheck “Along selected journey” to explore other parking.</p>}
        {!parkingLoading && visibleParking.length > 0 && origin && !closestParking && <p>Find the closest listed parking {alongJourney ? "along this journey " : ""}to <strong>{origin.label}</strong> (point A), or zoom in to explore the map.</p>}
        {parkingMapNote && <p>{parkingMapNote}</p>}
        {closestParking && origin && <>
          <span className="parking-result-label">Closest listed parking {alongJourney ? "along this journey " : ""}to point A</span>
          <strong className="parking-result-name">{closestParking.facility.name}</strong>
          <p>{parkingStyle(closestParking.facility).detail}</p>
          {closestParking.facility.operator !== "Operator not supplied" && <p>{closestParking.facility.operator}</p>}
          <p><b>{parkingDistance(closestParking.distanceKm)}</b> straight-line from {origin.label}. Road access has not been checked.</p>
          <p>{parkingAccess(closestParking.facility)}. Check entry conditions before travelling.
            {closestParking.facility.url && <> <a href={closestParking.facility.url} target="_blank" rel="noreferrer">Facility details</a></>}</p>
          <p>Source: {closestParking.facility.sources?.map(ref => ref.provider === "osm" ? "OpenStreetMap" : "opentransportdata.swiss").join(" + ")}.
            {closestParking.facility.sources?.some(ref => ref.provider === "osm" && !ref.id.startsWith("node/")) && " Area/line centre; entrance not verified."}</p>
        </>}
      </div>
      <div className="parking-source">
        {(["official", "osm"] as const).map(provider => {
          const load = parkingLoads[provider], data = load.data;
          return <p key={provider}><a href={provider === "osm" ? OSM_COPYRIGHT : PARKING_SOURCE} target="_blank" rel="noreferrer">{provider === "osm" ? "© OpenStreetMap contributors · ODbL" : "opentransportdata.swiss"}</a>
            {data ? <> · {data.facilities.length.toLocaleString("en-GB")} records · downloaded {new Date(data.fetchedAt).toLocaleDateString("en-GB")}{data.stale && " · refresh failed; showing older data"}</>
              : load.status === "error" ? ` · ${load.error?.message ?? "Loading failed. Retry loading."}` : " · loading"}</p>;
        })}
        <p>Coverage is incomplete; some source records may overlap. No live availability. Closest means straight-line distance from A among loaded records{alongJourney ? " along the selected journey" : ""}. Nearby parking may require a detour; entrances have not been checked. Your journey stays unchanged.</p>
      </div>
    </section>}
    {(["water", "toilets", "repairs", "food"] as const).map(category => {
      const enabled = { water: showWater, toilets: showToilets, repairs: showRepairs, food: showFood }[category];
      const source = category === "repairs" ? repairs : category === "food" ? food : amenities;
      return enabled && <AmenityLayer key={category}
        category={category} map={mapRef.current} origin={origin} data={source.data} loading={source.loading} error={source.error} retry={source.retry}
        scope={parkingRoute} alongJourney={alongJourney} radius={routeRadius} sharedCategories={sharedCategories} active={activeAmenity === category}
        kinds={category === "repairs" ? repairKinds : category === "food" ? foodKinds : undefined}
        onKinds={category === "repairs" ? setRepairKinds : category === "food" ? setFoodKinds : undefined}
        onActivate={() => { setClosestRequest(null); setActiveAmenity(category); }}
        onLocate={facility => {
          if (!mapRef.current || !origin) return;
          const bounds = L.latLngBounds([[origin.lat, origin.lon], [facility.lat, facility.lon]]);
          visibleBoundsRef.current = bounds; fitMap(mapRef.current, bounds);
        }} />;
    })}
  </>;
}
