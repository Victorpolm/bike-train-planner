import { useEffect, useRef } from "react";
import L from "leaflet";
import type { Journey, Place, Station } from "./routing";

type MapViewProps = {
  origin: Place | null;
  destination: Place | null;
  originStations: Station[];
  destinationStations: Station[];
  selectedJourney: Journey | null;
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
  selectedJourney,
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

    const addEndpoint = (place: Place, color: string, label: string) => {
      const point: L.LatLngExpression = [place.lat, place.lon];
      L.circle(point, {
        radius: 5000,
        color,
        fillColor: color,
        fillOpacity: 0.045,
        weight: 1.5,
        dashArray: "5 7",
      }).addTo(layer);
      L.marker(point, { icon: markerIcon(color, label) })
        .bindTooltip(place.label)
        .addTo(layer);
      bounds.extend(point);
    };

    if (origin) addEndpoint(origin, COLORS.origin, "A");
    if (destination) addEndpoint(destination, COLORS.destination, "B");

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
          `${station.name} · ${station.bikeMinutes} min by bike from ${side}`,
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
      L.polyline(
        [
          [first.lat, first.lon],
          [last.lat, last.lon],
        ],
        { color: COLORS.train, weight: 5 },
      ).addTo(layer);
      L.polyline(
        [
          [last.lat, last.lon],
          [destination.lat, destination.lon],
        ],
        { color: COLORS.destination, weight: 4, dashArray: "4 7" },
      ).addTo(layer);
    }

    if (bounds.isValid()) map.fitBounds(bounds.pad(0.16), { maxZoom: 12 });
  }, [origin, destination, originStations, destinationStations, selectedJourney]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map" aria-label="Journey map" />
      <div className="map-legend" aria-hidden="true">
        <span><i className="legend-bike" />Bike estimate</span>
        <span><i className="legend-train" />Train</span>
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
