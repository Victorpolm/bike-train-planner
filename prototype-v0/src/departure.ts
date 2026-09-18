const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// datetime-local carries no zone. Always display and interpret it in Swiss time,
// regardless of the user's device timezone.
export function swissDateTimeInput(date: Date): string {
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function parseSwissDateTime(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match) {
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    const wallTime = Date.UTC(year, month - 1, day, hour, minute);
    // Contemporary Switzerland uses UTC+1/UTC+2. Round-trip validation rejects
    // invalid dates and the skipped spring hour. Choose the first occurrence
    // of the repeated autumn hour deterministically.
    for (const offset of [120, 60]) {
      const candidate = new Date(wallTime - offset * 60_000);
      if (Number.isFinite(candidate.getTime()) && swissDateTimeInput(candidate) === value) return candidate;
    }
  }
  throw new Error("Choose a valid date and time in Switzerland. The spring clock-change hour is unavailable.");
}
