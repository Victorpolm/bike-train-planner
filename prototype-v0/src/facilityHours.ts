/** A deliberately bounded weekly-hours evaluator. Unsupported syntax never
 * becomes an open/closed assertion. Dates always use Swiss local time. */
export type HoursState = "open" | "closed" | "unknown";
const weekdays = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
type Rule = { days: number[]; ranges: [number, number][]; off: boolean };
const cache = new Map<string, Rule[] | null>();
function parse(raw: string): Rule[] | null {
  if (cache.has(raw)) return cache.get(raw)!;
  const result: Rule[] = [];
  const minutes = (s: string) => { const [h, m] = s.split(":").map(Number); return h <= 24 && m < 60 && (h < 24 || m === 0) ? h * 60 + m : NaN; };
  for (const part of raw.split(";")) {
    const match = part.trim().match(/^(?:(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+)?(off|closed|(?:\d{2}:\d{2}-\d{2}:\d{2})(?:\s*,\s*\d{2}:\d{2}-\d{2}:\d{2})*)(?:\s+open)?$/);
    if (!match) { result.length = 0; break; }
    const first = weekdays.indexOf(match[1]), last = weekdays.indexOf(match[2] ?? match[1]);
    const days = first < 0 ? [0, 1, 2, 3, 4, 5, 6] : Array.from({ length: (last - first + 7) % 7 + 1 }, (_, i) => (first + i) % 7);
    const off = ["off", "closed"].includes(match[3]);
    const ranges = off ? [] : match[3].split(",").map(s => s.trim().split("-").map(minutes) as [number, number]);
    // Equal endpoints are ambiguous, not proof of 24-hour opening.
    if (ranges.some(([a, b]) => !Number.isFinite(a) || !Number.isFinite(b) || a === b || a === 1440)) { result.length = 0; break; }
    result.push({ days, ranges, off });
  }
  if (cache.size >= 512) cache.clear();
  cache.set(raw, result.length ? result : null);
  return result.length ? result : null;
}
export function hoursAt(hours: string | undefined, at: Date): HoursState {
  if (!Number.isFinite(+at) || !hours?.trim()) return "unknown";
  const raw = hours.trim();
  if (raw === "24/7") return "open";
  const rules = parse(raw); if (!rules) return "unknown";
  const parts = clock.formatToParts(at), get = (k: string) => parts.find(p => p.type === k)?.value ?? "";
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const time = Number(get("hour")) * 60 + Number(get("minute"));
  let open = false;
  for (const rule of rules) {
    if (rule.days.includes(day)) {
      // A later rule replaces earlier opening hours on the selected weekday.
      open = !rule.off && rule.ranges.some(([a, b]) => a <= time && (b > a ? time < b : true));
    }
    if (!rule.off && rule.days.includes((day + 6) % 7)
      && rule.ranges.some(([a, b]) => b < a && time < b)) open = true;
  }
  return open ? "open" : "closed";
}
export function hoursDuring(hours: string | undefined, arrival: Date, departure = arrival): HoursState {
  if (!Number.isFinite(+arrival) || !Number.isFinite(+departure) || +departure < +arrival || +departure - +arrival > 7 * 86400000) return "unknown";
  const initial = hoursAt(hours, arrival);
  if (initial !== "open") return initial;
  // Check every minute boundary, rather than skipping short closures or DST.
  for (let time = (Math.floor(+arrival / 60000) + 1) * 60000; time < +departure; time += 60000) {
    const state = hoursAt(hours, new Date(time)); if (state !== "open") return state;
  }
  return "open";
}
export function visitHours(hours: string | undefined, seasonal: string | undefined, arrival: Date, departure = arrival) {
  const checked = hoursDuring(hours, arrival, departure);
  const state = seasonal && !["no", "false"].includes(seasonal.toLowerCase()) && checked === "open" ? "unknown" : checked;
  return { state, message: state === "closed" ? "Mapped hours do not cover this visit."
    : state === "open" ? "Mapped weekly hours cover this visit; holiday exceptions and actual access are unverified."
      : seasonal && !["no", "false"].includes(seasonal.toLowerCase()) ? `Seasonal operation (${seasonal}); availability for this visit is unverified.`
        : "Opening for this visit is unknown; check the source and local signs." };
}
