import assert from "node:assert/strict";
import test from "node:test";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary/domain";
import { FiscalFailure, fiscalDate, fiscalTaxDetermination } from "../../src/domain";

const VES = currency("VES", 2);

test("an exempt determination preserves its base with zero rate and tax", () => {
  const determination = fiscalTaxDetermination({
    taxCode: "iva-exempt", category: "exempt", calculationMode: "tax_exclusive", rate: exactDecimal("0"),
    taxableBase: moneyFromDecimal("100", VES), amount: moneyFromDecimal("0", VES),
    jurisdiction: "ve", ruleVersion: "rule-1", operationDate: fiscalDate("2026-09-27"), legalBasis: "IVA law",
    classificationVersion: "service-v4", classificationLegalBasis: "Service classification", source: { kind: "document" },
  });
  assert.equal(determination.taxCode, "IVA-EXEMPT");
  assert.equal(determination.jurisdiction, "VE");
  assert.equal(determination.operationDate, "2026-09-27");
  assert.equal(determination.classificationVersion, "service-v4");
});

test("an exempt determination cannot hide a tax amount", () => {
  assert.throws(() => fiscalTaxDetermination({
    taxCode: "IVA-EXEMPT", category: "exempt", calculationMode: "tax_exclusive", rate: exactDecimal("0"),
    taxableBase: moneyFromDecimal("100", VES), amount: moneyFromDecimal("1", VES),
    jurisdiction: "VE", ruleVersion: "rule-1", source: { kind: "document" },
  }), (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_TAX_INVALID");
});
