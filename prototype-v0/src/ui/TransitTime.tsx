import type { Timing } from "../realtime";
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
        {timing.cancelled ? (
          "Cancelled · original time"
        ) : timing.undefinedDelay ? (
          "Delay duration unknown"
        ) : timing.basis === "planned" ? (
          "Planned movement"
        ) : timing.basis === "scheduled" ? (
          "No live estimate · timetable"
        ) : (
          <>
            {timing.scheduled && `Scheduled ${clock.format(timing.scheduled)} · `}
            {(timing.delayMinutes ?? 0) >= 0 ? "+" : ""}
            {timing.delayMinutes} min
          </>
        )}
        {timing.basis !== "planned" && timing.freshness === "stale" && " · out of date"}
        {timing.basis === "estimated" && timing.freshness === "fresh" && " · fresh estimate"}
        {timing.checkedAt &&
          Number.isFinite(Date.parse(timing.checkedAt)) &&
          ` · checked ${clock.format(new Date(timing.checkedAt))}`}
      </small>
    </span>
  );
}
