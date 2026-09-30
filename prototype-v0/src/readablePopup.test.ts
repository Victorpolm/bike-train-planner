import assert from "node:assert/strict";
import { it } from "node:test";
import { EventEmitter } from "node:events";
import type L from "leaflet";
import { bindReadablePopup, readablePopupOptions } from "./readablePopup.ts";

it("keeps a clicked detail open through marker replacement, map movement and mouse departure", () => {
  const events = new EventEmitter(); let tooltip = true;
  let open: unknown = null;
  const marker = Object.assign(events, { closeTooltip: () => { tooltip = false; }, getLatLng: () => ({ lat: 47, lng: 8 }) });
  const map = { getSize: () => ({ x: 360, y: 400 }) };
  const content = {} as HTMLElement;
  let received: L.PopupOptions | undefined, displayed: HTMLElement | undefined;
  const createPopup = (options: L.PopupOptions) => {
    received = options;
    const popup = { setLatLng: () => popup, setContent: (value: HTMLElement) => { displayed = value; return popup; },
      openOn: (owner: unknown) => { assert.equal(owner, map); open = popup; return popup; } };
    return popup as unknown as L.Popup;
  };
  bindReadablePopup(marker as unknown as L.Marker, map as unknown as L.Map, content, createPopup);
  events.emit("click"); const first = open;
  assert.ok(first); assert.equal(tooltip, false); assert.equal(displayed, content);
  events.emit("remove"); events.emit("mouseout"); events.emit("moveend"); events.emit("zoomend");
  assert.equal(open, first, "A transient marker must not own the popup's lifetime");
  assert.equal(received?.closeOnClick, false); assert.equal(received?.closeButton, true);
  events.emit("click"); assert.notEqual(open, first, "A new selection replaces the previous popup");
});

it("bounds long popup content for scrolling on mobile and desktop maps", () => {
  const mobile = readablePopupOptions({ x: 320, y: 360 }), desktop = readablePopupOptions({ x: 900, y: 650 });
  assert.ok(mobile.maxWidth! <= 250); assert.ok(mobile.maxHeight! <= 270);
  assert.equal(desktop.maxWidth, 360); assert.equal(desktop.maxHeight, 350);
});
