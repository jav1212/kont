import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarDate,
  calendarValue,
  initialDate,
  validPeriod,
  withinBounds,
} from "../src/calendar";

test("date fields round-trip without UTC offsets and reject impossible dates", () => {
  for (const value of ["2024-02-29", "2026-09-06", "1999-12-31"]) {
    assert.equal(calendarValue(calendarDate(value)!), value);
  }
  for (const value of [
    "",
    "2025-02-29",
    "2026-02-31",
    "2026-00-01",
    "2026-13-01",
    "0000-01-01",
  ]) {
    assert.equal(calendarDate(value), null);
  }
});

test("inclusive bounds clamp only the displayed date and validate periods", () => {
  assert.equal(withinBounds("2026-09-01", "2026-09-01", "2026-09-30"), true);
  assert.equal(withinBounds("2026-10-01", "2026-09-01", "2026-09-30"), false);
  assert.equal(
    calendarValue(initialDate("2026-01-01", "2026-09-01")),
    "2026-09-01",
  );
  assert.equal(
    calendarValue(initialDate("2027-01-01", undefined, "2026-09-30")),
    "2026-09-30",
  );
  assert.equal(validPeriod("2026-09"), true);
  assert.equal(validPeriod("2026-13"), false);
});
