import assert from "node:assert/strict";
import { it } from "node:test";
import { hoursAt, hoursDuring, visitHours } from "./facilityHours.ts";

const mon = (time: string) => new Date(`2026-10-05T${time}:00+02:00`);
it("checks Swiss wall time and treats closing as exclusive", () => {
  assert.equal(hoursAt("Mo-Fr 08:00-18:00", mon("07:59")), "closed");
  assert.equal(hoursAt("Mo-Fr 08:00-18:00", mon("08:00")), "open");
  assert.equal(hoursAt("Mo-Fr 08:00-18:00", mon("18:00")), "closed");
  assert.equal(hoursAt("Mo-Fr 08:00-18:00", new Date("2026-10-11T12:00:00+02:00")), "closed");
});
it("checks every minute and allows departure exactly at closing", () => {
  const hours = "Mo 08:00-12:00,12:01-18:00";
  assert.equal(hoursDuring(hours, mon("11:55"), mon("12:00")), "open");
  assert.equal(hoursDuring(hours, mon("11:55"), mon("12:05")), "closed");
  assert.equal(hoursDuring(hours, mon("12:01"), mon("12:05")), "open");
});
it("supports overnight and wrap-around weekly ranges", () => {
  const hours = "Fr-Mo 22:00-02:00";
  for (const date of ["2026-10-05T01:00:00+02:00", "2026-10-05T23:00:00+02:00", "2026-10-06T01:00:00+02:00"]) assert.equal(hoursAt(hours, new Date(date)), "open");
  assert.equal(hoursAt(hours, new Date("2026-10-06T22:00:00+02:00")), "closed");
  assert.equal(hoursAt(hours, new Date("2026-10-06T02:00:00+02:00")), "closed");
});
it("honours later weekday replacement and closure rules", () => {
  assert.equal(hoursAt("08:00-18:00; Mo 10:00-12:00", mon("09:00")), "closed");
  assert.equal(hoursAt("08:00-18:00; Mo 10:00-12:00", mon("11:00")), "open");
  assert.equal(hoursAt("08:00-18:00; Mo off", mon("11:00")), "closed");
  assert.equal(hoursAt("Su 22:00-02:00; Mo off", mon("01:00")), "closed");
});
it("handles both fall-back clock occurrences and spring-forward elapsed time", () => {
  for (const offset of ["+02:00", "+01:00"]) assert.equal(hoursAt("Su 02:00-03:00", new Date(`2026-10-25T02:30:00${offset}`)), "open");
  assert.equal(hoursDuring("Su 01:00-04:00", new Date("2026-10-25T01:30:00+02:00"), new Date("2026-10-25T03:30:00+01:00")), "open");
  assert.equal(hoursDuring("Su 01:00-04:00", new Date("2026-03-29T01:30:00+01:00"), new Date("2026-03-29T03:30:00+02:00")), "open");
});
it("preserves unknown for holidays, seasonal expressions, malformed and unsupported syntax", () => {
  for (const hours of [undefined, "", "PH off", "Mo-Fr 08:00-18:00; PH off", "Apr-Oct 08:00-18:00", "sunrise-sunset", "08:00+", "Mo,We 08:00-18:00", "00:00-00:00", "24:00-02:00", "08:60-18:00", "25:00-26:00"]) assert.equal(hoursAt(hours, mon("12:00")), "unknown", hours);
  assert.equal(hoursAt("24/7", new Date(NaN)), "unknown");
  assert.equal(hoursDuring("24/7", mon("12:00"), mon("11:00")), "unknown");
  assert.equal(hoursDuring("24/7", mon("12:00"), new Date(+mon("12:00") + 8 * 86400000)), "unknown");
});
it("never treats seasonal operation as confirmed opening", () => {
  assert.equal(visitHours("24/7", "summer", mon("12:00")).state, "unknown");
  assert.equal(visitHours("24/7", "no", mon("12:00")).state, "open");
  assert.equal(visitHours("closed", "summer", mon("12:00")).state, "closed");
  assert.match(visitHours(undefined, undefined, mon("12:00")).message, /unknown/);
});
it("supports explicit midnight endpoints without treating ambiguous values as always open", () => {
  assert.equal(hoursAt("00:00-24:00", mon("23:59")), "open");
  assert.equal(hoursAt("24/7", mon("00:00")), "open");
  assert.equal(hoursAt("closed", mon("12:00")), "closed");
});
