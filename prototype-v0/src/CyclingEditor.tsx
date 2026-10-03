import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CyclingClient } from "./cyclingClient";
import {
  applyCyclingEdit,
  MAX_SHAPING_POINTS,
  requestEditedCycling,
  type AppliedCyclingEdit,
  type EditContext,
} from "./cyclingEditor";
import type { DetourStage } from "./cyclingDetour";
import type { CyclingRoute } from "./cycling";
import { addClimb, climbSummary, emptyClimb, routeClimb } from "./hills";
import { formatMinutes, type Place } from "./routing";

export default function CyclingEditor({
  map,
  stages,
  context,
  onApply,
  onClose,
}: {
  map: L.Map | null;
  stages: DetourStage[];
  context: EditContext;
  onApply: (edit: AppliedCyclingEdit) => void;
  onClose: () => void;
}) {
  const [stageId, setStageId] = useState(stages[0]?.id);
  const stage = stages.find((s) => s.id === stageId) ?? stages[0];
  const [points, setPoints] = useState<Place[]>([]);
  const [history, setHistory] = useState<Place[][]>([]);
  const [routes, setRoutes] = useState<CyclingRoute[] | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const actions = useRef({
    add: (_point: L.LatLng) => {},
    move: (_index: number, _point: L.LatLng) => {},
  });
  const change = (next: Place[]) => {
    setHistory((h) => [...h, points]);
    setPoints(next);
    setRoutes(null);
  };
  actions.current = {
    add: (point) => {
      if (points.length >= MAX_SHAPING_POINTS) {
        setStatus("Up to six points per section. Move or remove an existing point.");
        return;
      }
      change([
        ...points,
        { lat: point.lat, lon: point.lng, label: `Route point ${points.length + 1}` },
      ]);
    },
    move: (index, point) =>
      change(
        points.map((old, i) => (i === index ? { ...old, lat: point.lat, lon: point.lng } : old)),
      ),
  };
  useEffect(() => {
    if (!map) return;
    map.closePopup();
    const add = (event: L.LeafletEvent) =>
      actions.current.add((event as L.LeafletMouseEvent).latlng.wrap());
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Enter" && event.target === map.getContainer()) {
        event.preventDefault();
        actions.current.add(map.getCenter().wrap());
      }
    };
    map.on("click", add);
    map.on("cycling-editor-point", add);
    map.getContainer().addEventListener("keydown", keyboard);
    map.getContainer().classList.add("editing-cycling");
    return () => {
      map.off("click", add);
      map.off("cycling-editor-point", add);
      map.getContainer().removeEventListener("keydown", keyboard);
      map.getContainer().classList.remove("editing-cycling");
    };
  }, [map]);
  useEffect(() => {
    if (!map || !stage?.route.points.length) return;
    const bounds = L.latLngBounds(stage.route.points.map((p) => [p.lat, p.lon]));
    if (map.getContainer().clientWidth)
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16, animate: false });
  }, [map, stage]);
  useEffect(() => {
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    for (const route of routes ?? [])
      L.polyline(
        [route.from, ...route.points, route.to].map((p) => [p.lat, p.lon]),
        { color: "#76558e", weight: 6, dashArray: "8 8", interactive: false },
      ).addTo(layer);
    points.forEach((point, index) => {
      const badge = document.createElement("span");
      badge.textContent = String(index + 1);
      const marker = L.marker([point.lat, point.lon], {
        draggable: true,
        autoPan: true,
        zIndexOffset: 1800,
        title: `Move cycling route point ${index + 1}`,
        alt: `Cycling route point ${index + 1}`,
        icon: L.divIcon({
          className: "cycling-edit-point",
          html: badge,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        }),
      }).addTo(layer);
      marker.on("dragend", () => actions.current.move(index, marker.getLatLng().wrap()));
    });
    return () => {
      layer.remove();
    };
  }, [map, points, routes]);
  const { cyclingPace, cyclingRoutePreference, hills } = context.options;
  useEffect(() => {
    if (!stage) return;
    if (!points.length) {
      setRoutes([stage.route]);
      setBusy(false);
      setStatus("Tap the map to add route points, in order. Drag a numbered point to move it.");
      return;
    }
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]);
    setRoutes(null);
    setBusy(true);
    setStatus("Updating only this cycling section…");
    const timer = setTimeout(() => {
      const client = new CyclingClient(
        signal,
        fetch,
        500,
        true,
        fetch,
        cyclingPace,
        cyclingRoutePreference,
        undefined,
        hills,
      );
      void requestEditedCycling(stage, points, client, signal)
        .then((result) => {
          if (signal.aborted) return;
          setRoutes(result);
          setStatus("Preview ready. The public-transport services are unchanged.");
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setStatus(
              signal.aborted
                ? "The cycling check took too long. Move a point or retry."
                : error instanceof Error
                  ? error.message
                  : "The cycling check failed.",
            );
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [stage, points, attempt, cyclingPace, cyclingRoutePreference, hills]);
  const checked = useMemo(() => {
    if (!routes || !stage) return null;
    try {
      return { edit: applyCyclingEdit(context, stage, routes), error: "" };
    } catch (error) {
      return {
        edit: null,
        error: error instanceof Error ? error.message : "This edit cannot be applied.",
      };
    }
  }, [routes, stage, context]);
  const climb = routes?.reduce(
    (sum, route) => addClimb(sum, routeClimb(route, route.minutes, hills?.maxUphillPercent)),
    emptyClimb(),
  );
  return (
    <section className="cycling-editor" aria-label="Edit cycling section">
      <div className="detour-heading">
        <h3>Edit cycling section</h3>
        <button type="button" onClick={onClose}>
          Close editor
        </button>
      </div>
      <label>
        Section
        <select
          value={stage?.id ?? ""}
          onChange={(event) => {
            setStageId(event.target.value);
            setPoints([]);
            setHistory([]);
            setRoutes(null);
          }}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <p>
        Tap to add points, or drag numbered points. Keyboard: focus the map, pan with arrow keys,
        then press Enter. The section’s endpoints stay fixed.
      </p>
      {!!points.length && (
        <details>
          <summary>
            {points.length} route point{points.length > 1 ? "s" : ""} · change order or remove
          </summary>
          <ol>
            {points.map((point, index) => (
              <li key={index}>
                <span>
                  {index + 1}. {point.lat.toFixed(4)}, {point.lon.toFixed(4)}
                </span>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Move point ${index + 1} earlier`}
                  onClick={() => {
                    const next = [...points];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    change(next);
                  }}
                >
                  Earlier
                </button>
                <button
                  type="button"
                  aria-label={`Remove point ${index + 1}`}
                  onClick={() => change(points.filter((_, i) => i !== index))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
      {routes && climb && (
        <p>
          <b>
            {routes.reduce((sum, r) => sum + r.distanceKm, 0).toFixed(1)} km ·{" "}
            {formatMinutes(routes.reduce((sum, r) => sum + r.minutes, 0))}
          </b>{" "}
          · {climbSummary(climb, hills?.mode === "gentler" ? hills.maxUphillPercent : undefined)}
        </p>
      )}
      {checked?.error && (
        <p className="error" role="alert">
          {checked.error}
        </p>
      )}
      {checked?.edit && !!points.length && (
        <p>
          Timing and cycling limits fit.{" "}
          {context.journey
            ? "The selected services and their fare evidence are preserved."
            : "The rest of your cycling route stays unchanged."}
        </p>
      )}
      <div className="cycling-editor-actions">
        <button
          type="button"
          disabled={!history.length}
          onClick={() => {
            setPoints(history.at(-1)!);
            setHistory((h) => h.slice(0, -1));
            setRoutes(null);
          }}
        >
          Undo
        </button>
        <button type="button" disabled={!points.length} onClick={() => change([])}>
          Reset points
        </button>
        {!busy && !routes && (
          <button type="button" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        )}
        <button
          type="button"
          className="apply-cycling"
          disabled={busy || !points.length || !checked?.edit}
          onClick={() => {
            if (checked?.edit) onApply(checked.edit);
          }}
        >
          Apply cycling change
        </button>
      </div>
    </section>
  );
}
