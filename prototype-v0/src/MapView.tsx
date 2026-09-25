import { PARKING_SOURCE, type ParkingData } from "./bikeParking";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { formatMinutes, type CyclingComparison, type Journey, type Place, type Point } from "./routing";
import { journeyStops, type ExploredStop } from "./mapData";
import { pointAlong, type CyclingRoute } from "./cycling";

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
function fitMap(map: L.Map, bounds: L.LatLngBounds) {
  // Reserve room for controls, the legend and displaced stop labels on mobile.
  const controls = map.getContainer().parentElement?.querySelector(".map-controls")?.getBoundingClientRect().height ?? 68;
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
  const [parking, setParking] = useState<ParkingData | null>(null);
  const [parkingStatus, setParkingStatus] = useState("");
  useEffect(() => {
    if (!showParking || parking) return;
    const controller = new AbortController();
    setParkingStatus("Loading bicycle parking…");
    void fetch("/api/parking", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Parking unavailable");
      return await response.json() as ParkingData;
    }).then(data => { if (!controller.signal.aborted) { setParking(data); setParkingStatus(""); } }, () => {
      if (!controller.signal.aborted) setParkingStatus("Parking could not be loaded. Switch this layer off and on to retry.");
    });
    return () => controller.abort();
  }, [showParking, parking]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showParking || !parking) return;
    const layer = L.layerGroup().addTo(map);
    const draw = () => {
      layer.clearLayers();
      if (map.getZoom() < 10) return;
      for (const facility of parking.facilities) {
        if (!map.getBounds().pad(.1).contains([facility.lat, facility.lon])) continue;
        const content = popup(facility.name, [facility.operator,
          facility.type === "BIKE_STATION" ? "Bicycle station" : "Bicycle parking",
          facility.covered === true ? "Covered" : "Cover information not supplied",
          facility.capacity === null ? "Capacity not supplied" : `${facility.capacity} bicycle places in total (not availability)`,
          facility.publicAccess === false ? "Restricted access" : facility.publicAccess === true ? "Public access; check any access conditions" : "Access conditions not supplied",
          ...facility.traits]);
        if (facility.url) { const a = document.createElement("a"); a.href = facility.url; a.textContent = "Facility information"; a.target = "_blank"; a.rel = "noreferrer"; content.append(a); }
        L.circleMarker([facility.lat, facility.lon], { radius: 6, color: "#fff", weight: 2, fillColor: "#6545a4", fillOpacity: .95 })
          .bindTooltip(textNode(facility.name)).bindPopup(content).addTo(layer);
      }
    };
    draw(); map.on("moveend zoomend", draw);
    return () => { map.off("moveend zoomend", draw); layer.remove(); };
  }, [showParking, parking]);

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
        for (const [a, b] of [[route.from, route.points[0]], [route.points.at(-1)!, route.to]]) {
          L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { color: COLORS.walk, weight: 3, dashArray: "2 6", interactive: false }).addTo(layer);
        }
      }
      coordinates.forEach(p => allBounds.extend(p));
    };
    const pinLayer = L.layerGroup().addTo(layer);
    const drawPins = () => {
      pinLayer.clearLayers();
      const controlsBottom = (map.getContainer().parentElement?.querySelector(".map-controls")?.getBoundingClientRect().height ?? 68) + 32;
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

  return <div className="map-shell">
    <div ref={containerRef} className="map" aria-label={bikeOnlySelected ? "Cycling-only estimate map" : "Selected journey and explored stops map"} />
    <div className="map-controls">
      <button type="button" disabled={editingDisabled} onClick={() => {
        if (mapRef.current) pickerRef.current?.(mapRef.current.getCenter());
      }}>Choose map centre</button>
      <label><input type="checkbox" checked={showStops} onChange={e => setShowStops(e.target.checked)} />Explored stops ({stops.length})</label>
      <label><input type="checkbox" checked={showParking} onChange={e => setShowParking(e.target.checked)} />Bicycle parking</label>
      <button type="button" disabled={!stops.length} onClick={() => {
        setShowStops(true);
        if (allBoundsRef.current?.isValid() && mapRef.current) {
          visibleBoundsRef.current = allBoundsRef.current;
          fitMap(mapRef.current, allBoundsRef.current);
        }
      }}>Fit all stops</button>
      {showParking && <div className="parking-information" role="status">{parkingStatus || (parking ? `${parking.facilities.length} official and partner facilities. Zoom in to see parking.` : "")}
        {parking && <> <a href={PARKING_SOURCE} target="_blank" rel="noreferrer">Source</a> · downloaded {new Date(parking.fetchedAt).toLocaleDateString("en-GB")}.{parking.stale && " Refresh failed; the last downloaded data is shown."} Coverage is incomplete; no live availability. Parking does not change your route.</>}
      </div>}
      <div className="map-instruction">{editingDisabled ? "Stop the search to edit locations." : "Tap the map to choose locations. Drag A, B or a stop to move it."}</div>
    </div>
    <div className="map-legend">
      <span><i className="legend-bike-only" />Cycling only</span>
      <span><i className="legend-bike" />Cycling leg</span>
      <span><i className="legend-train" />Transit</span>
      <span><i className="legend-walk" />Walking</span>
      <span><i className="legend-climb" />Steep climb</span>
      <span><i className="legend-descent" />Steep descent</span>
      <span><i className="legend-stop" />Explored stop</span>
      <span><b className="legend-pin">1</b>Board / alight</span>
    </div>
  </div>;
}
