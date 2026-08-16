import assert from "node:assert/strict";
import test from "node:test";
import { currency } from "@kontave/monetary-domain";
import { PayrollRun, payrollDefinitionId, payrollPeriod, payrollRunId } from "../src/index";

const VES = currency("VES", 2);
test("confirmed payroll is immutable and must be reversed with a reason", () => {
  const draft = PayrollRun.draft({ id: payrollRunId("run-1"), payrollDefinitionId: payrollDefinitionId("definition-1"), period: payrollPeriod({ start: "2026-08-01", end: "2026-08-15", paymentDate: "2026-08-15", frequency: "biweekly", sequence: "2026-08-Q1" }), type: "regular", settlementCurrency: VES });
  assert.throws(() => draft.confirm("2026-08-15T12:00:00Z", false), { code: "PAYROLL_RUN_TRANSITION_INVALID" });
});
