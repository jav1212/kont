import assert from "node:assert/strict";
import test from "node:test";
import { companyId } from "@kontave/companies-domain";
import { currency, exactDecimal, exchangeRate, moneyFromDecimal } from "@kontave/monetary-domain";
import {
  FiscalDocument,
  FiscalFailure,
  fiscalDate,
  fiscalDocumentId,
  fiscalDocumentLineId,
  fiscalNumber,
  type FiscalDocumentState,
} from "../src/index.js";

const VES = currency("VES", 2);
const USD = currency("USD", 2);

function money(value: string) {
  return moneyFromDecimal(value, VES);
}

function draftState(overrides: Partial<FiscalDocumentState> = {}): FiscalDocumentState {
  const taxableLineId = fiscalDocumentLineId("line-taxable");
  const exemptLineId = fiscalDocumentLineId("line-exempt");
  return {
    id: fiscalDocumentId("fiscal-document-1"),
    companyId: companyId("company-1"),
    type: "invoice",
    direction: "issued",
    jurisdiction: "VE",
    documentCurrency: VES,
    issuer: { taxIdentifier: "J-31217119-7", legalName: "Kontave C.A.", fiscalAddress: null, additionalInformation: [] },
    recipient: { taxIdentifier: "J-12345678-9", legalName: "Cliente C.A.", fiscalAddress: null, additionalInformation: [] },
    affectedDocument: null,
    lines: [
      {
        id: taxableLineId,
        commercialReference: "product-1",
        description: "Producto gravado",
        quantity: exactDecimal("1"),
        unitCode: "EA",
        unitPrice: money("100"),
        grossAmount: money("100"),
        adjustments: [{ kind: "discount", scope: "line", calculation: { kind: "percentage", rate: exactDecimal("10") }, reason: "Promocion", amount: money("10") }],
        netAmount: money("90"),
      },
      {
        id: exemptLineId,
        commercialReference: null,
        description: "Servicio exento",
        quantity: exactDecimal("1"),
        unitCode: "SERVICE",
        unitPrice: money("50"),
        grossAmount: money("50"),
        adjustments: [],
        netAmount: money("50"),
      },
    ],
    documentAdjustments: [],
    taxDeterminations: [
      { taxCode: "IVA", category: "taxable", calculationMode: "tax_exclusive", rate: exactDecimal("16"), taxableBase: money("90"), amount: money("14.40"), jurisdiction: "VE", ruleVersion: "iva-example-v1", source: { kind: "line", lineId: taxableLineId } },
      { taxCode: "IVA-EXEMPT", category: "exempt", calculationMode: "tax_exclusive", rate: exactDecimal("0"), taxableBase: money("50"), amount: money("0"), jurisdiction: "VE", ruleVersion: "exemption-example-v1", source: { kind: "line", lineId: exemptLineId } },
    ],
    payments: [{ key: "cash-1", methodCode: "cash", tenderedAmount: money("100"), recognizedAmount: money("100"), exchangeRate: null }],
    totals: {
      grossAmount: money("150"), discountTotal: money("10"), surchargeTotal: money("0"), netAmount: money("140"),
      taxSummaries: [
        { taxCode: "IVA", category: "taxable", calculationMode: "tax_exclusive", rate: exactDecimal("16"), taxableBase: money("90"), amount: money("14.40") },
        { taxCode: "IVA-EXEMPT", category: "exempt", calculationMode: "tax_exclusive", rate: exactDecimal("0"), taxableBase: money("50"), amount: money("0") },
      ],
      taxTotal: money("14.40"), payableAmount: money("154.40"),
      recognizedPayments: money("100"), changeAmount: money("0"), outstandingAmount: money("54.40"),
    },
    status: "draft",
    number: null,
    issuedAt: null,
    issueDate: null,
    issuanceEvidence: null,
    ...overrides,
  };
}

test("fiscal invoice preserves commercial, tax and payment snapshots before issuance", () => {
  const document = new FiscalDocument(draftState());
  assert.equal(document.status, "draft");
  assert.equal(document.lines[0]?.commercialReference, "product-1");
  assert.equal(document.taxDeterminations[0]?.taxCode, "IVA");
  assert.equal(document.totals.outstandingAmount.minorAmount, 5_440n);
});

test("issuing keeps the document identity and records provider-neutral evidence", () => {
  const draft = new FiscalDocument(draftState());
  const issued = draft.issue({
    number: "00001325",
    issuedAt: "2026-08-13T14:42:00-04:00",
    issueDate: "2026-08-13",
    evidence: { provider: "authorized-fiscal-adapter", externalDocumentNumber: "00001325", authorization: null, deviceRegistration: "Z1F9999988" },
  });
  assert.equal(issued.id, draft.id);
  assert.equal(issued.status, "issued");
  assert.equal(issued.number, "00001325");
  assert.equal(issued.issuanceEvidence?.provider, "authorized-fiscal-adapter");
  assert.throws(() => issued.issue({ number: "2", issuedAt: "2026-08-13T15:00:00-04:00", issueDate: "2026-08-13", evidence: null }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_TRANSITION_INVALID");
});

test("credit and debit notes require an affected fiscal document", () => {
  assert.throws(() => new FiscalDocument(draftState({ type: "credit_note" })),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_REFERENCE_INVALID");
  const note = new FiscalDocument(draftState({
    type: "credit_note",
    affectedDocument: {
      type: "invoice",
      fiscalNumber: fiscalNumber("00001325"),
      issueDate: fiscalDate("2026-08-12"),
      issuerTaxIdentifier: "J-31217119-7",
      issuerRegistration: "Z1F9999988",
      internalDocumentId: null,
    },
  }));
  assert.equal(note.affectedDocument?.fiscalNumber, "00001325");
});

test("a received invoice is registered without pretending that Kontave issued it", () => {
  const draft = new FiscalDocument(draftState({ direction: "received" }));
  const received = draft.registerReceived({
    number: "SUP-00042", issuedAt: "2026-08-13T09:00:00-04:00", issueDate: "2026-08-13",
    evidence: { provider: "supplier-document", externalDocumentNumber: "SUP-00042", authorization: null, deviceRegistration: null },
  });
  assert.equal(received.type, "invoice");
  assert.equal(received.direction, "received");
  assert.equal(received.status, "received");
  assert.throws(() => draft.issue({ number: "1", issuedAt: "2026-08-13T09:00:00-04:00", issueDate: "2026-08-13", evidence: null }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_TRANSITION_INVALID");
});

test("foreign-currency fiscal payments require a compatible exchange-rate snapshot", () => {
  const rate = exchangeRate({ baseCurrency: USD, quoteCurrency: VES, value: "50" });
  const foreignPayment = {
    key: "foreign-1",
    methodCode: "foreign-cash",
    tenderedAmount: moneyFromDecimal("2", USD),
    recognizedAmount: money("100"),
    exchangeRate: { rate, effectiveDate: "2026-08-13", capturedAt: "2026-08-13T10:00:00-04:00", source: { kind: "official" as const, authority: "BCV", reference: null } },
  };
  const document = new FiscalDocument(draftState({ payments: [foreignPayment] }));
  assert.equal(document.payments[0]?.tenderedAmount.currency.code, "USD");
  assert.equal(document.payments[0]?.recognizedAmount.currency.code, "VES");
});

test("document rejects totals that do not reconcile", () => {
  const state = draftState();
  assert.throws(() => new FiscalDocument({ ...state, totals: { ...state.totals, payableAmount: money("999") } }),
    (error: unknown) => error instanceof FiscalFailure && error.code === "FISCAL_TOTALS_MISMATCH");
});

test("tax included in line prices is reported but not added twice to payable", () => {
  const state = draftState();
  const inclusiveTaxes = state.taxDeterminations.map((tax) => tax.taxCode === "IVA" ? { ...tax, calculationMode: "tax_inclusive" as const } : tax);
  const inclusiveSummaries = state.totals.taxSummaries.map((tax) => tax.taxCode === "IVA" ? { ...tax, calculationMode: "tax_inclusive" as const } : tax);
  const document = new FiscalDocument({
    ...state,
    taxDeterminations: inclusiveTaxes,
    totals: { ...state.totals, taxSummaries: inclusiveSummaries, payableAmount: money("140"), outstandingAmount: money("40") },
  });
  assert.equal(document.totals.taxTotal.minorAmount, 1_440n);
  assert.equal(document.totals.payableAmount.minorAmount, 14_000n);
});
