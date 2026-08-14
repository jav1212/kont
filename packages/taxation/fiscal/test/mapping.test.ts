import assert from "node:assert/strict";
import test from "node:test";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary-domain";
import { taxCode, taxDecision } from "@kontave/taxation-domain";
import { toFiscalTaxDetermination } from "../src/index.js";

const VES = currency("VES", 2);

test("tax decisions become immutable fiscal snapshots with the correct source", () => {
  const decision = taxDecision({
    taxCode: taxCode("IVA"), treatment: "exonerated", calculationMode: "tax_exclusive", rate: exactDecimal("0"),
    taxableBase: moneyFromDecimal("100", VES), amount: moneyFromDecimal("0", VES), jurisdiction: "VE",
    ruleVersion: "class-v1|rule-v1", legalBasis: "Example", source: { kind: "line", reference: "line-1" },
  });
  const fiscal = toFiscalTaxDetermination(decision);
  assert.equal(fiscal.category, "exonerated");
  assert.deepEqual(fiscal.source, { kind: "line", lineId: "line-1" });
});
