import assert from "node:assert/strict";
import { it } from "node:test";
import { parseSwissDateTime, swissDateTimeInput } from "./departure.ts";

it("interprets chosen departures in Swiss time in summer and winter, independently of the device timezone", () => {
  assert.equal(parseSwissDateTime("2026-09-21T08:00").toISOString(), "2026-09-21T06:00:00.000Z");
  assert.equal(parseSwissDateTime("2027-01-21T08:00").toISOString(), "2027-01-21T07:00:00.000Z");
  assert.equal(swissDateTimeInput(new Date("2026-09-18T22:30:00Z")), "2026-09-19T00:30");
});

it("rejects invalid calendar dates and the nonexistent spring hour; resolves the repeated autumn hour consistently", () => {
  for (const value of ["", "2026-02-30T08:00", "2026-09-21T25:00", "2026-03-29T02:30"]) {
    assert.throws(() => parseSwissDateTime(value), /valid date and time/);
  }
  assert.equal(parseSwissDateTime("2026-10-25T02:30").toISOString(), "2026-10-25T00:30:00.000Z");
});
