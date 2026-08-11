import assert from "node:assert/strict";import test from "node:test";import {Currency,money} from "@kontave/billing-domain";import {organizationId} from "@kontave/organizations-domain";import {assertDistinctOrganizations,calculatePercentageReward} from "../src/index.js";
test("legacy twenty percent policy rounds in minor units",()=>assert.equal(calculatePercentageReward(money(BigInt(1001),Currency.Usd),2000).minorAmount,BigInt(200)));
test("self referrals are rejected",()=>assert.throws(()=>assertDistinctOrganizations(organizationId("o"),organizationId("o")),{code:"SELF_REFERRAL"}));
