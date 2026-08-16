import test from "node:test";
import assert from "node:assert/strict";
import { companyId,organizationId,userId } from "@kontave/organizations-domain";
import { InventoryDashboardFailure,validateInventoryDashboardQuery } from "../src/index";
const base={actorUserId:userId("user"),organizationId:organizationId("organization"),companyId:companyId("company"),from:"2026-08-01",to:"2026-08-16",granularity:"day" as const,recentLimit:5};
test("accepts an inclusive dashboard period",()=>assert.equal(validateInventoryDashboardQuery(base).to,"2026-08-16"));
test("rejects reversed periods",()=>assert.throws(()=>validateInventoryDashboardQuery({...base,from:"2026-08-17"}),InventoryDashboardFailure));
test("rejects periods longer than one year",()=>assert.throws(()=>validateInventoryDashboardQuery({...base,from:"2025-01-01"}),InventoryDashboardFailure));
