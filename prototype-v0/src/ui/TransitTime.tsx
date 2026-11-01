import type { Timing } from "../realtime";
import { timingStatus } from "../realtime";
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  hour: "2-digit",
  minute: "2-digit",
});
export default function TransitTime({ timing }: { timing: Timing }) {
  if (!timing.at) return <span>Time unavailable</span>;
  return (
    <span className="qualified-time">
      <time dateTime={timing.at.toISOString()}>
        {clock.format(timing.at)} ·{" "}
        {new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Zurich",
          day: "numeric",
          month: "short",
        }).format(timing.at)}
      </time>
      <small>
        {timingStatus(timing)}
        {timing.basis === "estimated" &&
          timing.scheduled &&
          ` · Scheduled ${clock.format(timing.scheduled)}`}
        {timing.basis !== "planned" && timing.freshness === "stale" && " · out of date"}
        {timing.refreshFailed && " · last live check failed"}
        {timing.basis === "estimated" && timing.freshness === "fresh" && " · fresh estimate"}
        {timing.checkedAt &&
          Number.isFinite(Date.parse(timing.checkedAt)) &&
          ` · checked ${clock.format(new Date(timing.checkedAt))}`}
      </small>
    </span>
  );
}
