import assert from "node:assert/strict";
import test from "node:test";
import { company, operationalCompany } from "../src/domains/organizations/decoding";
import { billingPlan } from "../src/domains/billing/decoding";
import { companyFixture, operationalCompanyFixture, billingPlanFixture } from "./response-fixtures";

test("older company responses default to standard without accepting unknown profiles", () => {
  const { operatingProfile: _profile, ...legacy } = companyFixture;
  assert.equal(company(legacy)?.operatingProfile, "standard");
  assert.equal(company({ ...legacy, operatingProfile: "kiosk" })?.operatingProfile, "kiosk");
  assert.equal(company({ ...legacy, operatingProfile: "restaurant" }), null);
  assert.equal(company({ ...legacy, operatingProfile: null }), null);
  const { operatingProfile: _operationalProfile, ...operational } = operationalCompanyFixture;
  assert.equal(operationalCompany(operational)?.operatingProfile, "standard");
  assert.equal(operationalCompany({ ...operational, operatingProfile: "kiosk" })?.operatingProfile, "kiosk");
});

test("older plan responses advertise no implicit modules while new bundles survive decoding", () => {
  const { includedModules: _modules, commercialCode: _code, ...legacy } = billingPlanFixture;
  assert.deepEqual(billingPlan(legacy)?.includedModules, []);
  assert.equal(billingPlan(legacy)?.commercialCode, null);
  assert.deepEqual(billingPlan(billingPlanFixture)?.includedModules, ["inventory", "purchases", "sales"]);
  assert.equal(billingPlan({ ...legacy, includedModules: "inventory" }), null);
});
