import { TIMING_STAGES, type SearchTimingReport, type TimingStage } from "../searchTiming";

const names: Record<TimingStage, string> = {
  places: "Resolve places",
  setup: "Connect services",
  stops: "Find stops",
  timetable: "Timetable work",
  transfers: "Load station transfers",
  cycling: "Cycling route work",
  walking: "Walking route work",
  network: "HTTP responses",
  queue: "Local request queues",
  pacing: "Service pacing / retry waits",
  reuse: "Check reusable results",
  solving: "Journey calculations",
};
const seconds = (value: number | null) =>
  value === null ? "Not reached" : `${(value / 1000).toFixed(2)} s`;
export default function SearchTimingSummary({ report }: { report: SearchTimingReport | null }) {
  if (!report) return null;
  const status = {
    running: "In progress",
    complete: "Finished",
    limited: "Search limit reached",
    cancelled: "Cancelled",
    failed: "Failed",
  }[report.status];
  return (
    <details className="search-notice search-timing">
      <summary>Search timings · {status}</summary>
      <dl>
        <dt>First result ready</dt>
        <dd>{seconds(report.firstResultMs)}</dd>
        <dt>First public-transport result ready</dt>
        <dd>{seconds(report.firstTransitMs)}</dd>
        <dt>Total elapsed</dt>
        <dd>{seconds(report.elapsedMs)}</dd>
      </dl>
      <table>
        <caption>Cumulative work during this search</caption>
        <thead>
          <tr>
            <th scope="col">Stage</th>
            <th scope="col">Calls</th>
            <th scope="col">Time</th>
          </tr>
        </thead>
        <tbody>
          {TIMING_STAGES.filter((stage) => report.stages[stage]).map((stage) => (
            <tr key={stage}>
              <th scope="row">{names[stage]}</th>
              <td>{report.stages[stage]!.calls}</td>
              <td>{seconds(report.stages[stage]!.milliseconds)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {report.reusedRefreshes} of {report.refreshes} result updates reused unchanged calculations.{" "}
        {report.solverCalls} solver runs.
      </p>
      <p>
        Stages overlap and must not be added together. Route work includes its request queues and
        responses; HTTP time includes server/provider waiting and reading the reply. “Ready” means
        calculated, before screen rendering. Later fare and live-service checks are separate.
      </p>
      <p>These measurements stay in this page and contain no location trace.</p>
    </details>
  );
}
