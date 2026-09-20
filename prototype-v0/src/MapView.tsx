import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { formatMinutes, type CyclingComparison, type Journey, type Place, type Point } from "./routing";
import { journeyStops, type ExploredStop } from "./mapData";

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
  accessMinutes: number;
  egressMinutes: number;
};

const COLORS = { origin: "#d66b3d", destination: "#195e4d", transit: "#2f557f", bikeOnly: "#76558e", walk: "#647269" };
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
  stops, selectedJourney, cycling, bikeOnlySelected, accessMinutes, egressMinutes,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const allBoundsRef = useRef<L.LatLngBounds | null>(null);
  const visibleBoundsRef = useRef<L.LatLngBounds | null>(null);
  const redrawPinsRef = useRef<(() => void) | null>(null);
  const fittedRef = useRef("");
  const skipFitRef = useRef(false);
  const pickerRef = useRef<((point: L.LatLng) => void) | null>(null);
  const handlers = useRef({ editingDisabled, canAddWaypoint, onSelectPoint, onMovePoint });
  handlers.current = { editingDisabled, canAddWaypoint, onSelectPoint, onMovePoint };
  const [showStops, setShowStops] = useState(true);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView([46.8182, 8.2275], 8);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map; layerRef.current = L.layerGroup().addTo(map);
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
    const addEndpoint = (id: string, place: Place, color: string, label: string, minutes?: number) => {
      const point: L.LatLngExpression = [place.lat, place.lon];
      if (!bikeOnlySelected && minutes !== undefined) L.circle(point, {
        radius: Number.isFinite(minutes) ? minutes * 250 : 0, color, fillColor: color, fillOpacity: .035, weight: 1, dashArray: "5 7",
      }).addTo(layer);
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
    if (origin) addEndpoint("origin", origin, COLORS.origin, "A", accessMinutes);
    waypoints.forEach(({ id, place, number }) => addEndpoint(id, place, COLORS.bikeOnly, `V${number}`));
    if (destination) addEndpoint("destination", destination, COLORS.destination, "B", egressMinutes);
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
          + (e.platform ? " · platform " + e.platform : ""));
        L.marker([stop.lat, stop.lon], {
          icon: markerIcon(COLORS.transit, String(stop.number), offset), title, alt: title, zIndexOffset: 800,
        }).bindTooltip(textNode(title)).bindPopup(popup(title, events)).addTo(pinLayer);
      }
    };

    if (origin && destination && cycling) {
      L.polyline([origin, ...waypoints.map(w => w.place), destination].map(p => [p.lat, p.lon] as [number, number]), {
        color: COLORS.bikeOnly, weight: bikeOnlySelected ? 5 : 2, opacity: bikeOnlySelected ? .9 : .45,
        dashArray: "8 8", className: "bike-only-line",
      }).bindTooltip(textNode("Cycling only · ≈ " + formatMinutes(cycling.minutes) + " · straight-line estimate")).addTo(layer);
    }

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
      if (!selectedJourney.legsIncludeEndpoints) L.polyline([[origin.lat, origin.lon], [first.lat, first.lon]],
        { color: COLORS.origin, weight: 4, dashArray: "4 7", className: "journey-line" }).addTo(layer);
      bounds.extend([first.lat, first.lon]); bounds.extend([last.lat, last.lon]);
      for (const leg of selectedJourney.transitLegs) {
        const points = leg.geometry ?? [leg.fromPoint, leg.toPoint].filter((p): p is Point => !!p);
        if (points.length < 2) continue;
        const coordinates = points.map(p => [p.lat, p.lon] as [number, number]);
        L.polyline(coordinates, {
          color: leg.mode === "bike" ? COLORS.origin : leg.mode === "walk" ? COLORS.walk : COLORS.transit,
          weight: leg.mode === "transit" ? 5 : 4, dashArray: leg.mode === "transit" ? undefined : "4 7", className: "journey-line",
        }).bindTooltip(textNode(leg.service + ": " + leg.from + " → " + leg.to)).addTo(layer);
        coordinates.forEach(point => bounds.extend(point));
      }
      if (!selectedJourney.legsIncludeEndpoints) L.polyline([[last.lat, last.lon], [destination.lat, destination.lon]],
        { color: COLORS.destination, weight: 4, dashArray: "4 7", className: "journey-line" }).addTo(layer);
      for (const stop of selectedStops) {
        bounds.extend([stop.lat, stop.lon]);
      }
    }

    allBounds.extend(bounds); allBoundsRef.current = allBounds;
    // Background updates must not undo a user's zoom while inspecting a stop.
    const fitKey = [origin?.lat, origin?.lon, destination?.lat, destination?.lon,
      ...waypoints.flatMap(w => [w.id, w.place.lat, w.place.lon]),
      selectedJourney?.id ?? "bike-only"].join("|");
    if (bounds.isValid() && fittedRef.current !== fitKey) {
      visibleBoundsRef.current = bounds;
      if (!skipFitRef.current) fitMap(map, bounds);
      fittedRef.current = fitKey;
    }
    skipFitRef.current = false;
    redrawPinsRef.current = drawPins;
    drawPins(); map.on("zoomend", drawPins);
    return () => { map.off("zoomend", drawPins); redrawPinsRef.current = null; };
  }, [origin, destination, waypoints, editingDisabled, stops, selectedJourney, cycling, bikeOnlySelected, showStops, accessMinutes, egressMinutes]);

  return <div className="map-shell">
    <div ref={containerRef} className="map" aria-label={bikeOnlySelected ? "Cycling-only estimate map" : "Selected journey and explored stops map"} />
    <div className="map-controls">
      <button type="button" disabled={editingDisabled} onClick={() => {
        if (mapRef.current) pickerRef.current?.(mapRef.current.getCenter());
      }}>Choose map centre</button>
      <label><input type="checkbox" checked={showStops} onChange={e => setShowStops(e.target.checked)} />Explored stops ({stops.length})</label>
      <button type="button" disabled={!stops.length} onClick={() => {
        setShowStops(true);
        if (allBoundsRef.current?.isValid() && mapRef.current) {
          visibleBoundsRef.current = allBoundsRef.current;
          fitMap(mapRef.current, allBoundsRef.current);
        }
      }}>Fit all stops</button>
      <div className="map-instruction">{editingDisabled ? "Stop the search to edit locations." : "Tap the map to choose locations. Drag A, B or a stop to move it."}</div>
    </div>
    <div className="map-legend">
      <span><i className="legend-bike-only" />Cycling only</span>
      <span><i className="legend-bike" />Cycling leg</span>
      <span><i className="legend-train" />Transit</span>
      <span><i className="legend-walk" />Walking</span>
      <span><i className="legend-stop" />Explored stop</span>
      <span><b className="legend-pin">1</b>Board / alight</span>
    </div>
  </div>;
}
