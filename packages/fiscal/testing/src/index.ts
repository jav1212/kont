import { companyId } from "@kontave/companies-domain";
import { FiscalDocument, fiscalDocumentId, fiscalDocumentLineId, type FiscalDocumentState } from "@kontave/fiscal-domain";
import { currency, exactDecimal, moneyFromDecimal } from "@kontave/monetary-domain";

export const FISCAL_TEST_CURRENCY = currency("VES", 2);

export function fiscalInvoiceFixture(overrides: Partial<FiscalDocumentState> = {}): FiscalDocument {
  const lineId = fiscalDocumentLineId("fiscal-line-1");
  const amount = moneyFromDecimal("100", FISCAL_TEST_CURRENCY);
  const zero = moneyFromDecimal("0", FISCAL_TEST_CURRENCY);
  return new FiscalDocument({
    id: fiscalDocumentId("fiscal-document-1"), companyId: companyId("fiscal-company-1"), type: "invoice", direction: "issued",
    jurisdiction: "VE", documentCurrency: FISCAL_TEST_CURRENCY,
    issuer: { taxIdentifier: "J-31217119-7", legalName: "Issuer C.A.", fiscalAddress: null, additionalInformation: [] },
    recipient: { taxIdentifier: "J-12345678-9", legalName: "Recipient C.A.", fiscalAddress: null, additionalInformation: [] },
    affectedDocument: null,
    lines: [{ id: lineId, commercialReference: null, description: "Fiscal item", quantity: exactDecimal("1"), unitCode: "EA", unitPrice: amount, grossAmount: amount, adjustments: [], netAmount: amount }],
    documentAdjustments: [],
    taxDeterminations: [{ taxCode: "IVA-EXEMPT", category: "exempt", calculationMode: "tax_exclusive", rate: exactDecimal("0"), taxableBase: amount, amount: zero, jurisdiction: "VE", ruleVersion: "fixture-v1", source: { kind: "line", lineId } }],
    payments: [],
    totals: { grossAmount: amount, discountTotal: zero, surchargeTotal: zero, netAmount: amount, taxSummaries: [{ taxCode: "IVA-EXEMPT", category: "exempt", calculationMode: "tax_exclusive", rate: exactDecimal("0"), taxableBase: amount, amount: zero }], taxTotal: zero, payableAmount: amount, recognizedPayments: zero, changeAmount: zero, outstandingAmount: amount },
    status: "draft", number: null, issuedAt: null, issueDate: null, issuanceEvidence: null,
    ...overrides,
  });
}
