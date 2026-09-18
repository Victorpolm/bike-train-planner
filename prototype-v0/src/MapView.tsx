import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { formatMinutes, type CyclingComparison, type Journey, type Place, type Point } from "./routing";
import { journeyStops, type ExploredStop } from "./mapData";

type MapViewProps = {
  origin: Place | null;
  destination: Place | null;
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
  map.fitBounds(bounds, { paddingTopLeft: [48, 88], paddingBottomRight: [56, 84], maxZoom: 14, animate: false });
}

export default function MapView({
  origin, destination, stops, selectedJourney, cycling, bikeOnlySelected, accessMinutes, egressMinutes,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const allBoundsRef = useRef<L.LatLngBounds | null>(null);
  const visibleBoundsRef = useRef<L.LatLngBounds | null>(null);
  const redrawPinsRef = useRef<(() => void) | null>(null);
  const fittedRef = useRef("");
  const [showStops, setShowStops] = useState(true);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true }).setView([46.8182, 8.2275], 8);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map; layerRef.current = L.layerGroup().addTo(map);
    const observer = new ResizeObserver(() => {
      map.invalidateSize({ pan: false });
      if (visibleBoundsRef.current?.isValid()) fitMap(map, visibleBoundsRef.current);
      redrawPinsRef.current?.();
    });
    observer.observe(containerRef.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; fittedRef.current = ""; };
  }, []);

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = L.latLngBounds([]), allBounds = L.latLngBounds([]);
    const selectedStops = selectedJourney ? journeyStops(selectedJourney) : [];
    const selectedIds = new Set(selectedStops.map(s => s.id));
    const addEndpoint = (place: Place, color: string, label: string, minutes: number) => {
      const point: L.LatLngExpression = [place.lat, place.lon];
      if (!bikeOnlySelected) L.circle(point, {
        radius: Number.isFinite(minutes) ? minutes * 250 : 0, color, fillColor: color, fillOpacity: .035, weight: 1, dashArray: "5 7",
      }).addTo(layer);
      L.marker(point, { icon: markerIcon(color, label), title: label + ": " + place.label, zIndexOffset: 1000 })
        .bindTooltip(textNode(place.label)).bindPopup(popup(label === "A" ? "Origin" : "Destination", [place.label])).addTo(layer);
      bounds.extend(point); allBounds.extend(point);
    };
    if (origin) addEndpoint(origin, COLORS.origin, "A", accessMinutes);
    if (destination) addEndpoint(destination, COLORS.destination, "B", egressMinutes);
    const pinLayer = L.layerGroup().addTo(layer);
    const drawPins = () => {
      pinLayer.clearLayers();
      const placed = [origin, destination].filter((p): p is Place => p !== null)
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
          && screen.y + p.y >= 90 && screen.y + p.y <= size.y - 82
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
      L.polyline([[origin.lat, origin.lon], [destination.lat, destination.lon]], {
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
      L.polyline([[origin.lat, origin.lon], [first.lat, first.lon]],
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
      L.polyline([[last.lat, last.lon], [destination.lat, destination.lon]],
        { color: COLORS.destination, weight: 4, dashArray: "4 7", className: "journey-line" }).addTo(layer);
      for (const stop of selectedStops) {
        bounds.extend([stop.lat, stop.lon]);
      }
    }

    allBounds.extend(bounds); allBoundsRef.current = allBounds;
    // Background updates must not undo a user's zoom while inspecting a stop.
    const fitKey = [origin?.lat, origin?.lon, destination?.lat, destination?.lon,
      selectedJourney?.id ?? "bike-only"].join("|");
    if (bounds.isValid() && fittedRef.current !== fitKey) {
      visibleBoundsRef.current = bounds;
      fitMap(map, bounds); fittedRef.current = fitKey;
    }
    redrawPinsRef.current = drawPins;
    drawPins(); map.on("zoomend", drawPins);
    return () => { map.off("zoomend", drawPins); redrawPinsRef.current = null; };
  }, [origin, destination, stops, selectedJourney, cycling, bikeOnlySelected, showStops, accessMinutes, egressMinutes]);

  return <div className="map-shell">
    <div ref={containerRef} className="map" aria-label={bikeOnlySelected ? "Cycling-only estimate map" : "Selected journey and explored stops map"} />
    {origin && <div className="map-controls">
      <label><input type="checkbox" checked={showStops} onChange={e => setShowStops(e.target.checked)} />Explored stops ({stops.length})</label>
      <button type="button" disabled={!stops.length} onClick={() => {
        setShowStops(true);
        if (allBoundsRef.current?.isValid() && mapRef.current) {
          visibleBoundsRef.current = allBoundsRef.current;
          fitMap(mapRef.current, allBoundsRef.current);
        }
      }}>Fit all stops</button>
    </div>}
    <div className="map-legend">
      <span><i className="legend-bike-only" />Cycling only</span>
      <span><i className="legend-bike" />Cycling leg</span>
      <span><i className="legend-train" />Transit</span>
      <span><i className="legend-walk" />Walking</span>
      <span><i className="legend-stop" />Explored stop</span>
      <span><b className="legend-pin">1</b>Board / alight</span>
    </div>
    {!origin && <div className="map-empty"><span>CH</span><strong>Your route will appear here</strong>
      <small>Try Zürich HB → Bern, Bundesplatz</small></div>}
  </div>;
}
