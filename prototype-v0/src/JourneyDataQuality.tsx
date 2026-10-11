import { useId, useState } from "react";
import { carriageForLeg } from "./bicycleCarriage";
import { journeyDataReport } from "./journeyDataQuality";
import type { Journey } from "./routing";
import type { FareProfile } from "./fares";
import type { OnlineFare } from "./onlineFare";

export default function JourneyDataQuality({
  journey,
  profile,
  quote,
  takeBikeOnTransit,
}: {
  journey: Journey;
  profile: FareProfile;
  quote?: OnlineFare;
  takeBikeOnTransit: boolean;
}) {
  const id = useId(),
    [observation, setObservation] = useState(""),
    [minutes, setMinutes] = useState("");
  const services = journey.transitLegs.filter((l) => l.mode === "transit"),
    rules = services.map(carriageForLeg);
  const missing = services.filter((_, i) => rules[i].permission === "uncertain");
  const report = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          journeyDataReport(
            journey,
            profile,
            quote,
            takeBikeOnTransit,
            observation,
            Number(minutes),
          ),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "re-route-journey-report.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <details className="journey-data-quality">
      <summary>Data quality and corrections</summary>
      {takeBikeOnTransit && (
        <p>
          {missing.length
            ? `Bicycle permission needs checking on ${missing.map((l) => l.service).join(", ")}.`
            : "Bicycle permission has been assessed for each service; available space is not checked."}{" "}
          {rules.filter((r) => r.bikeReservation === "unknown").length} services have unknown
          reservation requirements.
        </p>
      )}
      <p>
        Online passenger prices come from a test system. Reviewed standard tariffs take priority.
        Missing prices stay unknown.
      </p>
      <p>
        Station transfer times do not verify lifts, stairs or bicycle access. Service-specific GTFS
        exceptions still need exact service matching. Facility entrances and complex opening hours
        need field checks.
      </p>
      <label htmlFor={`${id}-note`}>What differed from the journey shown?</label>
      <textarea
        id={`${id}-note`}
        value={observation}
        maxLength={2000}
        rows={3}
        onChange={(e) => setObservation(e.target.value)}
        placeholder="For example: SBB showed a different fare, or a station entrance was inaccessible."
      />
      <label htmlFor={`${id}-minutes`}>
        Observed cycling minutes (optional; exclude waiting and visits)
      </label>
      <input
        id={`${id}-minutes`}
        type="number"
        min="1"
        max="1440"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
      />
      <p>
        Download the service times, fare profile and data evidence, then share the file here with an
        SBB screenshot if useful. It contains your selected public-transport stops and observations.
        Nothing is sent automatically; GPS history and saved places are excluded.
      </p>
      <button type="button" onClick={report}>
        Download journey report
      </button>
    </details>
  );
}
