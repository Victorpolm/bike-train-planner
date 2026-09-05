import { FormEvent, useMemo, useState } from "react";
import { findCandidateStations, findJourneys, geocode } from "./api";
import MapView from "./MapView";
import JourneyPlan from "./JourneyPlan";
import {
  BIKE_SPEED_KMH,
  MAX_BIKE_MINUTES,
  STATION_BUFFER_MINUTES,
  formatMinutes,
  type Journey,
  type Place,
  type Station,
} from "./routing";

type Status =
  | { phase: "idle" }
  | { phase: "geocoding" }
  | { phase: "stations" }
  | { phase: "connections"; completed: number; total: number }
  | { phase: "done" }
  | { phase: "error"; message: string };

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});

function StatusMessage({ status }: { status: Status }) {
  if (status.phase === "geocoding") return <p>Finding both places…</p>;
  if (status.phase === "stations") return <p>Finding nearby rail stations…</p>;
  if (status.phase === "connections") {
    return (
      <p>
        Comparing train connections {status.completed}/{status.total}…
      </p>
    );
  }
  return null;
}

function StationList({ title, stations }: { title: string; stations: Station[] }) {
  return (
    <div className="station-list">
      <span>{title}</span>
      <div>
        {stations.map((station) => (
          <small key={station.id}>
            {station.name} <b>{station.bikeMinutes} min</b>
          </small>
        ))}
      </div>
    </div>
  );
}

function JourneyCard({
  journey,
  selected,
  expanded,
  planId,
  onSelect,
}: {
  journey: Journey;
  selected: boolean;
  expanded: boolean;
  planId: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`journey-card${selected ? " selected" : ""}`}
      onClick={onSelect}
      aria-expanded={expanded}
      aria-controls={planId}
    >
      <div className="journey-topline">
        <strong>{formatMinutes(journey.totalMinutes)}</strong>
        <span>{!journey.transitLegs.length ? "Transit connection" : journey.changes ? `${journey.changes} change${journey.changes === 1 ? "" : "s"}` : "Direct connection"}</span>
      </div>
      <div className="timeline" aria-hidden="true">
        <i className="bike-line" />
        <i className="train-line" />
        <i className="bike-line end" />
      </div>
      <div className="legs">
        <div>
          <small>Bike</small>
          <b>{journey.originStation.bikeMinutes} min</b>
          <span>{journey.originStation.name}</span>
        </div>
        <div>
          <small>{journey.services.join(" · ") || "Train"}</small>
          <b>
            {timeFormatter.format(journey.departure)}–
            {timeFormatter.format(journey.arrival)}
          </b>
          <span>{journey.trainMinutes} min including transfers</span>
        </div>
        <div>
          <small>Bike</small>
          <b>{journey.destinationStation.bikeMinutes} min</b>
          <span>{journey.destinationStation.name}</span>
        </div>
      </div>
      <span className="journey-plan-toggle">{expanded ? "Hide travel plan −" : "View travel plan +"}</span>
    </button>
  );
}

export default function App() {
  const [fromInput, setFromInput] = useState("Stauffacherstrasse 60, Zürich");
  const [toInput, setToInput] = useState("Bern, Bundesplatz");
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [originStations, setOriginStations] = useState<Station[]>([]);
  const [destinationStations, setDestinationStations] = useState<Station[]>([]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ phase: "idle" });

  const selectedJourney = useMemo(
    () => journeys.find((journey) => journey.id === selectedId) ?? journeys[0] ?? null,
    [journeys, selectedId],
  );
  const loading = ["geocoding", "stations", "connections"].includes(status.phase);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!fromInput.trim() || !toInput.trim() || loading) return;
    setJourneys([]);
    setSelectedId(null);
    setExpandedId(null);
    setOriginStations([]);
    setDestinationStations([]);

    try {
      setStatus({ phase: "geocoding" });
      const [resolvedOrigin, resolvedDestination] = await Promise.all([
        geocode(fromInput.trim()),
        geocode(toInput.trim()),
      ]);
      setOrigin(resolvedOrigin);
      setDestination(resolvedDestination);

      setStatus({ phase: "stations" });
      const nearbyOrigin = await findCandidateStations(resolvedOrigin);
      const nearbyDestination = await findCandidateStations(resolvedDestination);
      setOriginStations(nearbyOrigin);
      setDestinationStations(nearbyDestination);

      if (!nearbyOrigin.length || !nearbyDestination.length) {
        throw new Error(
          "No likely rail station was found within the 20-minute cycling estimate at one end of this journey.",
        );
      }

      const results = await findJourneys(
        nearbyOrigin,
        nearbyDestination,
        new Date(),
        (completed, total) =>
          setStatus({ phase: "connections", completed, total }),
      );
      if (!results.length) {
        throw new Error("No train connection was returned for these candidate stations.");
      }
      setJourneys(results);
      setSelectedId(results[0].id);
      setStatus({ phase: "done" });
    } catch (error) {
      setStatus({
        phase: "error",
        message: error instanceof Error ? error.message : "The search failed.",
      });
    }
  }

  return (
    <div className="app-shell">
      <header>
        <a className="brand" href="#top" aria-label="Bike plus train home">
          <span className="brand-mark">B<span>+</span>T</span>
          <span><strong>Bike + Train</strong><small>Swiss route experiment</small></span>
        </a>
        <span className="prototype-badge">Prototype · journey details</span>
      </header>

      <main id="top">
        <section className="planner-panel">
          <div className="intro">
            <p className="eyebrow">One journey, both modes</p>
            <h1>Find the quickest bike–train combination.</h1>
            <p>
              We scan likely rail stations within a {MAX_BIKE_MINUTES}-minute ride
              of each endpoint, then compare the next train connections.
            </p>
          </div>

          <form onSubmit={search} className="search-form">
            <label>
              <span>Departure point</span>
              <input
                value={fromInput}
                onChange={(event) => setFromInput(event.target.value)}
                placeholder="Street, place or station"
                autoComplete="off"
              />
            </label>
            <button
              className="swap-button"
              type="button"
              aria-label="Swap departure and arrival"
              onClick={() => {
                setFromInput(toInput);
                setToInput(fromInput);
              }}
            >
              ⇅
            </button>
            <label>
              <span>Arrival point</span>
              <input
                value={toInput}
                onChange={(event) => setToInput(event.target.value)}
                placeholder="Street, place or station"
                autoComplete="off"
              />
            </label>
            <button className="search-button" type="submit" disabled={loading}>
              {loading ? "Calculating…" : "Compare routes"}
            </button>
          </form>

          <div className="assumptions">
            <span><b>{BIKE_SPEED_KMH} km/h</b> bike speed</span>
            <span><b>{MAX_BIKE_MINUTES} min</b> station radius</span>
            <span><b>{STATION_BUFFER_MINUTES} min</b> boarding buffer</span>
            <span><b>Leave now</b> timetable</span>
          </div>

          {loading && (
            <div className="loading-block" role="status">
              <div className="progress-track"><i /></div>
              <StatusMessage status={status} />
              <small>The public timetable service limits request speed, so comparison takes a few seconds.</small>
            </div>
          )}

          {status.phase === "error" && (
            <div className="error-block" role="alert">
              <strong>We could not complete this route.</strong>
              <p>{status.message}</p>
              <small>This prototype uses a deliberately simple station-detection heuristic.</small>
            </div>
          )}

          {originStations.length > 0 && destinationStations.length > 0 && (
            <div className="candidate-stations">
              <StationList title="Near departure" stations={originStations} />
              <StationList title="Near arrival" stations={destinationStations} />
            </div>
          )}

          {journeys.length > 0 && (
            <section className="results" aria-live="polite">
              <div className="results-heading">
                <div>
                  <p className="eyebrow">Best combinations now</p>
                  <h2>{journeys.length} routes compared</h2>
                </div>
                <small>Ranked by arrival at destination</small>
              </div>
              <div className="journey-list">
                {journeys.map((journey, index) => {
                  const expanded = expandedId === journey.id;
                  const planId = `journey-plan-${index}`;
                  return (
                    <div key={journey.id} className="journey-option">
                      <JourneyCard
                        journey={journey}
                        selected={journey.id === selectedJourney?.id}
                        expanded={expanded}
                        planId={planId}
                        onSelect={() => {
                          setSelectedId(journey.id);
                          setExpandedId(expanded ? null : journey.id);
                        }}
                      />
                      {expanded && origin && destination && (
                        <JourneyPlan id={planId} journey={journey} origin={origin} destination={destination} />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </section>

        <aside className="map-panel">
          <MapView
            origin={origin}
            destination={destination}
            originStations={originStations}
            destinationStations={destinationStations}
            selectedJourney={selectedJourney}
          />
          <div className="model-note">
            <strong>Prototype model</strong>
            <p>
              Cycling legs are straight-line estimates, not navigable paths. The map
              deliberately exposes this approximation instead of pretending it is a
              safe cycle route.
            </p>
          </div>
        </aside>
      </main>
    </div>
  );
}
