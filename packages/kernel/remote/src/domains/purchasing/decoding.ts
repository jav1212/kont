import type {
  PurchasingDashboardDto,
  PurchasingDashboardSummaryDto,
  PurchasingAmountDto,
  PurchasingDashboardDayDto,
  PurchasingTopSupplierDto,
  PurchasingSupplierDto,
  RecentPurchasingDocumentDto,
  PurchasingTransactionAmountDto,
} from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  textField,
  numberField,
  shape,
  list,
  nullOr,
  literal,
  responseDto,
  type ResponseField,
} from "../../response-shape";

const purchasingAmountDtoShape: ResponseField<PurchasingAmountDto> =
  shape<PurchasingAmountDto>({
    amount: textField,
    currency: literal("VES"),
  });

const purchasingDashboardSummaryDtoShape: ResponseField<PurchasingDashboardSummaryDto> =
  shape<PurchasingDashboardSummaryDto>({
    confirmedPurchaseTotal: purchasingAmountDtoShape,
    vatCreditTotal: purchasingAmountDtoShape,
    vatWithheldTotal: purchasingAmountDtoShape,
    confirmedDocumentCount: numberField,
    draftDocumentCount: numberField,
  });

const purchasingDashboardDayDtoShape: ResponseField<PurchasingDashboardDayDto> =
  shape<PurchasingDashboardDayDto>({
    date: textField,
    confirmedPurchaseTotal: purchasingAmountDtoShape,
    vatCreditTotal: purchasingAmountDtoShape,
    confirmedDocumentCount: numberField,
    draftDocumentCount: numberField,
  });

const purchasingSupplierDtoShape: ResponseField<PurchasingSupplierDto> =
  shape<PurchasingSupplierDto>({
    id: nullOr(textField),
    legalName: textField,
    taxIdentifier: nullOr(textField),
  });

const purchasingTopSupplierDtoShape: ResponseField<PurchasingTopSupplierDto> =
  shape<PurchasingTopSupplierDto>({
    supplier: purchasingSupplierDtoShape,
    confirmedPurchaseTotal: purchasingAmountDtoShape,
    confirmedDocumentCount: numberField,
  });

const purchasingTransactionAmountDtoShape: ResponseField<PurchasingTransactionAmountDto> =
  shape<PurchasingTransactionAmountDto>({
    amount: textField,
    currency: textField,
  });

const recentPurchasingDocumentDtoShape: ResponseField<RecentPurchasingDocumentDto> =
  shape<RecentPurchasingDocumentDto>({
    id: textField,
    documentType: literal("invoice", "credit_note", "debit_note"),
    invoiceNumber: textField,
    controlNumber: nullOr(textField),
    supplier: purchasingSupplierDtoShape,
    fiscalDate: textField,
    status: literal("draft", "confirmed"),
    functionalAmounts: shape({
      subtotal: purchasingAmountDtoShape,
      vat: purchasingAmountDtoShape,
      vatWithheld: purchasingAmountDtoShape,
      total: purchasingAmountDtoShape,
    }),
    transactionCurrency: textField,
    transactionAmounts: shape({
      subtotal: nullOr(purchasingTransactionAmountDtoShape),
      vat: nullOr(purchasingTransactionAmountDtoShape),
      total: nullOr(purchasingTransactionAmountDtoShape),
    }),
  });

const purchasingDashboardDtoShape: ResponseField<PurchasingDashboardDto> =
  shape<PurchasingDashboardDto>({
    period: shape({
      from: textField,
      to: textField,
      granularity: literal("day"),
    }),
    summary: purchasingDashboardSummaryDtoShape,
    daily: list(purchasingDashboardDayDtoShape),
    topSuppliers: list(purchasingTopSupplierDtoShape),
    recentDocuments: list(recentPurchasingDocumentDtoShape),
    generatedAt: textField,
  });

/**
 * Validates the complete PurchasingDashboardDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const purchasingDashboard: Decoder<PurchasingDashboardDto> = responseDto(
  purchasingDashboardDtoShape,
);
