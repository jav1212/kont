import assert from "node:assert/strict";
import test from "node:test";
import { PERMISSIONS, permissionCode } from "@kontave/access-control/domain";
import {
  canReadSalesDashboard,
  resolveSalesLanding,
  salesDashboardAccessRequirement,
} from "../../src/application";

test("sales dashboard requires sales reading and its explicit dashboard grant", () => {
  assert.deepEqual(salesDashboardAccessRequirement, [
    permissionCode(PERMISSIONS.SALES_READ),
    permissionCode(PERMISSIONS.SALES_READ_DASHBOARD),
  ]);
  assert.equal(canReadSalesDashboard([permissionCode(PERMISSIONS.SALES_READ)]), false);
  assert.equal(
    canReadSalesDashboard([
      permissionCode(PERMISSIONS.SALES_READ),
      permissionCode(PERMISSIONS.SALES_READ_DASHBOARD),
    ]),
    true,
  );
});

test("sales landing prioritizes dashboard, then point of sale, then archive", () => {
  assert.equal(resolveSalesLanding([]), "unavailable");
  assert.equal(resolveSalesLanding([permissionCode(PERMISSIONS.SALES_READ)]), "archive");
  assert.equal(resolveSalesLanding([
    permissionCode(PERMISSIONS.SALES_READ),
    permissionCode(PERMISSIONS.SALES_CREATE),
  ]), "point-of-sale");
  assert.equal(resolveSalesLanding([
    permissionCode(PERMISSIONS.SALES_READ),
    permissionCode(PERMISSIONS.SALES_READ_DASHBOARD),
    permissionCode(PERMISSIONS.SALES_CREATE),
  ]), "dashboard");
});
