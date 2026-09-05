import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Journey, Place, Station, Point } from "./routing";

type MapViewProps = {
  origin: Place | null;
  destination: Place | null;
  originStations: Station[];
  destinationStations: Station[];
  selectedJourney: Journey | null;
  accessMinutes: number;
  egressMinutes: number;
};

const COLORS = {
  origin: "#d66b3d",
  destination: "#195e4d",
  train: "#2f557f",
};

function markerIcon(color: string, label: string) {
  return L.divIcon({
    className: "custom-marker",
    html: `<span style="--marker-color:${color}">${label}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export default function MapView({
  origin,
  destination,
  originStations,
  destinationStations,
  selectedJourney, accessMinutes, egressMinutes,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
    }).setView([46.8182, 8.2275], 8);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds = L.latLngBounds([]);

    const tooltip = (text: string) => { const node = document.createElement("span"); node.textContent = text; return node; };
    const addEndpoint = (place: Place, color: string, label: string, minutes: number) => {
      const point: L.LatLngExpression = [place.lat, place.lon];
      L.circle(point, {
        radius: Number.isFinite(minutes) ? minutes * 250 : 0,
        color,
        fillColor: color,
        fillOpacity: 0.045,
        weight: 1.5,
        dashArray: "5 7",
      }).addTo(layer);
      L.marker(point, { icon: markerIcon(color, label) })
        .bindTooltip(tooltip(place.label))
        .addTo(layer);
      bounds.extend(point);
    };

    if (origin) addEndpoint(origin, COLORS.origin, "A", accessMinutes);
    if (destination) addEndpoint(destination, COLORS.destination, "B", egressMinutes);

    const allStations = [
      ...originStations.map((station) => ({ station, side: "origin" })),
      ...destinationStations.map((station) => ({ station, side: "destination" })),
    ];
    allStations.forEach(({ station, side }) => {
      const selected =
        station.id === selectedJourney?.originStation.id ||
        station.id === selectedJourney?.destinationStation.id;
      L.circleMarker([station.lat, station.lon], {
        radius: selected ? 8 : 5,
        color: "#ffffff",
        weight: 2,
        fillColor: COLORS.train,
        fillOpacity: selected ? 1 : 0.7,
      })
        .bindTooltip(
          tooltip(`${station.name} · ${station.bikeMinutes} min by bike from ${side}`),
        )
        .addTo(layer);
      bounds.extend([station.lat, station.lon]);
    });

    if (selectedJourney && origin && destination) {
      const first = selectedJourney.originStation;
      const last = selectedJourney.destinationStation;
      L.polyline(
        [
          [origin.lat, origin.lon],
          [first.lat, first.lon],
        ],
        { color: COLORS.origin, weight: 4, dashArray: "4 7" },
      ).addTo(layer);
      for (const leg of selectedJourney.transitLegs) {
        const points = leg.geometry ?? [leg.fromPoint, leg.toPoint].filter((p): p is Point => !!p);
        if (points.length < 2) continue;
        const coordinates = points.map(p => [p.lat, p.lon] as [number, number]);
        L.polyline(coordinates, { color: leg.mode === "bike" ? COLORS.origin : leg.mode === "walk" ? "#6f7b75" : COLORS.train,
          weight: leg.mode === "transit" ? 5 : 4, dashArray: leg.mode === "transit" ? undefined : "4 7" })
          .bindTooltip(tooltip(`${leg.service}: ${leg.from} → ${leg.to}`)).addTo(layer);
        coordinates.forEach(point => bounds.extend(point));
      }
      L.polyline(
        [
          [last.lat, last.lon],
          [destination.lat, destination.lon],
        ],
        { color: COLORS.destination, weight: 4, dashArray: "4 7" },
      ).addTo(layer);
    }

    if (bounds.isValid()) map.fitBounds(bounds.pad(0.16), { maxZoom: 12 });
  }, [origin, destination, originStations, destinationStations, selectedJourney, accessMinutes, egressMinutes]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map" aria-label="Journey map" />
      <div className="map-legend" aria-hidden="true">
        <span><i className="legend-bike" />Bike estimate</span>
        <span><i className="legend-train" />Public transport</span>
      </div>
      {!origin && (
        <div className="map-empty">
          <span>CH</span>
          <strong>Your route will appear here</strong>
          <small>Try Zürich HB → Bern, Bundesplatz</small>
        </div>
      )}
    </div>
  );
}
