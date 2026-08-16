import assert from "node:assert/strict";
import test from "node:test";
import { resolvePurchasingDashboardPeriod } from "./desktop-purchasing-dashboard-controller.js";

test("defaults to the complete month of the company effective date", () => {
  assert.deepEqual(resolvePurchasingDashboardPeriod("2026-02-14", {}), {
    from: "2026-02-01",
    to: "2026-02-28",
  });
});

test("preserves an explicitly selected period", () => {
  assert.deepEqual(resolvePurchasingDashboardPeriod("2026-08-16", { from: "2026-07-01", to: "2026-07-31" }), {
    from: "2026-07-01",
    to: "2026-07-31",
  });
});
