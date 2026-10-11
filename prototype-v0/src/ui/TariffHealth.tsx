import { useState } from "react";
import { tariffHealth } from "../tariffSources";
type Health = {
  checkedAt: string | null;
  sourceCheckStale: boolean;
  sourceChecks: {
    id: string;
    status: string;
    checkedAt: string;
    candidateSaved?: boolean;
    reason?: string;
  }[];
  canary: { state: string; reason: string };
};
export default function TariffHealth() {
  const entries = tariffHealth(),
    [health, setHealth] = useState<Health | null>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      const response = await fetch("/api/maintenance/status");
      if (!response.ok) throw new Error();
      setHealth(await response.json());
      setError("");
    } catch {
      setError(
        "The last automatic check could not be read. The reviewed tariff dates below still apply.",
      );
    }
  }
  return (
    <details
      className="tariff-health"
      onToggle={(e) => {
        if (e.currentTarget.open && !health && !error) void load();
      }}
    >
      <summary>Tariff coverage and renewal dates</summary>
      <p>
        Prices use reviewed date ranges. Renewals are monitored; a changed source is reviewed before
        new prices are activated.
      </p>
      <ul>
        {entries.map(({ source, state, daysRemaining }) => (
          <li key={source.id}>
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.title}
            </a>
            : {source.validFrom}–{source.validThrough} ·{" "}
            {state === "expired"
              ? "reviewed coverage expired"
              : state === "review-due"
                ? `renewal review due · ${daysRemaining} days of coverage left`
                : "within reviewed coverage"}
          </li>
        ))}
      </ul>
      {health && (
        <>
          <p>
            Automatic monitor:{" "}
            {health.checkedAt
              ? new Date(health.checkedAt).toLocaleString("en-GB", { timeZone: "Europe/Zurich" }) +
                " Swiss time"
              : "not run yet"}
            {health.sourceCheckStale ? " · check is overdue" : ""}.
          </p>
          <p>
            Live-data canary: {health.canary.state}. {health.canary.reason}
          </p>
          <ul>
            {health.sourceChecks.map((s) => (
              <li key={s.id}>
                {entries.find((e) => e.source.id === s.id)?.source.title ?? s.id}: {s.status}.{" "}
                {s.reason}
                {s.candidateSaved && (
                  <>
                    {" "}
                    <a href={`/api/maintenance/sources/${s.id}`}>
                      Download retrieved source for review
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p role="status">
          {error}{" "}
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </p>
      )}
      <a href="/api/maintenance/status" target="_blank" rel="noreferrer">
        Automatic check details
      </a>
    </details>
  );
}
