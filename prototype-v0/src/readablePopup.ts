import type L from "leaflet";

export function readablePopupOptions(size: { x: number; y: number }): L.PopupOptions {
  return { className: "readable-map-popup", closeButton: true, closeOnClick: false,
    autoClose: true, autoPan: true, offset: [0, -14],
    maxWidth: Math.max(160, Math.min(360, size.x - 70)),
    maxHeight: Math.max(100, Math.min(350, size.y - 90)) };
}

// Viewport refreshes replace markers. A popup bound to one of those markers is
// removed during Leaflet's own auto-pan. Give the popup to the map instead.
export function bindReadablePopup<T extends L.Marker | L.CircleMarker>(marker: T, map: L.Map,
  content: HTMLElement, createPopup: (options: L.PopupOptions) => L.Popup): T {
  marker.on("click", () => {
    marker.closeTooltip();
    createPopup(readablePopupOptions(map.getSize())).setLatLng(marker.getLatLng()).setContent(content).openOn(map);
  });
  return marker;
}
