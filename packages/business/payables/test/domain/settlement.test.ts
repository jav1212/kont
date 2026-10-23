import assert from "node:assert/strict";
import test from "node:test";
import { exactDecimal } from "@kontave/monetary/domain";
import { settlePayableCurrency, splitInstallmentAmounts, validateInstallmentAmounts } from "../../src/domain/settlement";
import { payableSide } from "../../src/domain/model";

test("a VES payment of a USD debt converts at today's USD rate and realizes the difference", () => {
  // 60 VES at 3 VES/USD cancel 20 USD of a debt recorded at 2 VES/USD: 20 VES of exchange loss.
  assert.deepEqual(settlePayableCurrency({ paymentAmount: exactDecimal("60"), paymentCurrency: "VES", paymentRate: exactDecimal("1"), debtCurrency: "USD", debtCurrentRate: exactDecimal("3"), debtSnapshotRate: exactDecimal("2") }), {
    appliedDebtAmount: exactDecimal("20.00"), consumedPaymentAmount: exactDecimal("60"), exchangeDifferenceVes: exactDecimal("20.00"),
  });
});

test("same-currency payments apply one to one and only measure the difference", () => {
  const settled = settlePayableCurrency({ paymentAmount: exactDecimal("10"), paymentCurrency: "USD", paymentRate: exactDecimal("30"), debtCurrency: "USD", debtCurrentRate: exactDecimal("30"), debtSnapshotRate: exactDecimal("40") });
  assert.equal(settled.appliedDebtAmount, "10");
  assert.equal(settled.exchangeDifferenceVes, "-100", "a cheaper dollar is an exchange gain");
});

test("EUR payments of USD debts cross through VES and VES debts never realize differences", () => {
  assert.equal(settlePayableCurrency({ paymentAmount: exactDecimal("10"), paymentCurrency: "EUR", paymentRate: exactDecimal("44"), debtCurrency: "USD", debtCurrentRate: exactDecimal("40"), debtSnapshotRate: exactDecimal("40") }).appliedDebtAmount, "11");
  assert.equal(settlePayableCurrency({ paymentAmount: exactDecimal("5"), paymentCurrency: "USD", paymentRate: exactDecimal("40"), debtCurrency: "VES", debtCurrentRate: exactDecimal("1"), debtSnapshotRate: exactDecimal("1") }).exchangeDifferenceVes, "0");
  assert.throws(() => settlePayableCurrency({ paymentAmount: exactDecimal("0.001"), paymentCurrency: "VES", paymentRate: exactDecimal("1"), debtCurrency: "USD", debtCurrentRate: exactDecimal("40"), debtSnapshotRate: exactDecimal("40") }), { code: "INVALID" });
});

test("installment amounts must sum exactly to transferable balance", () => {
  assert.deepEqual(validateInstallmentAmounts(exactDecimal("100.01"), [exactDecimal("50"), exactDecimal("50.01")]), ["50", "50.01"]);
  assert.throws(() => validateInstallmentAmounts(exactDecimal("100"), [exactDecimal("40"), exactDecimal("59")]), { code: "EXCEEDS_BALANCE" });
});

test("installment split conserves every minor unit and carries the remainder to the last installment", () => {
  const amounts = splitInstallmentAmounts(exactDecimal("100.00"), 3);
  assert.deepEqual(amounts, ["33.33", "33.33", "33.34"]);
  assert.deepEqual(validateInstallmentAmounts(exactDecimal("100.00"), amounts), amounts);
  assert.throws(() => splitInstallmentAmounts(exactDecimal("0.01"), 2), { code: "INVALID" });
  assert.throws(() => splitInstallmentAmounts(exactDecimal("10"), 1), { code: "INVALID" });
});

test("credit notes and negative adjustments are credits; every other kind is debt", () => {
  assert.equal(payableSide("credit_note"), "credit");
  assert.equal(payableSide("negative_adjustment"), "credit");
  assert.equal(payableSide("installment"), "debit");
  assert.equal(payableSide("opening_balance"), "debit");
});
