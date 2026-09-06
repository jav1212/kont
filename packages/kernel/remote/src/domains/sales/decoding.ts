import type {
  SalesDashboardDto,
  SalesDashboardSummaryDto,
  SalesAmountDto,
  SalesDashboardDailyPointDto,
  SalesDashboardDocumentDto,
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

const salesAmountDtoShape: ResponseField<SalesAmountDto> =
  shape<SalesAmountDto>({
    amount: textField,
    currency: literal("VES"),
  });

const salesDashboardSummaryDtoShape: ResponseField<SalesDashboardSummaryDto> =
  shape<SalesDashboardSummaryDto>({
    confirmedInvoicedAmount: salesAmountDtoShape,
    taxableBaseAmount: salesAmountDtoShape,
    vatDebitAmount: salesAmountDtoShape,
    confirmedInvoiceCount: numberField,
    draftInvoiceCount: numberField,
    averageTicketAmount: salesAmountDtoShape,
  });

const salesDashboardDailyPointDtoShape: ResponseField<SalesDashboardDailyPointDto> =
  shape<SalesDashboardDailyPointDto>({
    date: textField,
    confirmedInvoicedAmount: salesAmountDtoShape,
    taxableBaseAmount: salesAmountDtoShape,
    vatDebitAmount: salesAmountDtoShape,
    confirmedInvoiceCount: numberField,
  });

const salesDashboardDocumentDtoShape: ResponseField<SalesDashboardDocumentDto> =
  shape<SalesDashboardDocumentDto>({
    id: textField,
    sourceKind: literal("legacy_sales_invoice"),
    documentType: literal("invoice"),
    invoiceNumber: textField,
    customerName: nullOr(textField),
    date: textField,
    status: literal("confirmed", "draft"),
    salesChannel: literal("administrative", "pos"),
    subtotal: salesAmountDtoShape,
    taxableBase: salesAmountDtoShape,
    vatAmount: salesAmountDtoShape,
    total: salesAmountDtoShape,
    transactionCurrency: textField,
    sourceSubtotal: nullOr(textField),
    sourceVatAmount: nullOr(textField),
    sourceTotal: nullOr(textField),
  });

const salesDashboardDtoShape: ResponseField<SalesDashboardDto> =
  shape<SalesDashboardDto>({
    period: shape({
      from: textField,
      to: textField,
      granularity: literal("day"),
    }),
    summary: salesDashboardSummaryDtoShape,
    charts: list(salesDashboardDailyPointDtoShape),
    recentConfirmedInvoices: list(salesDashboardDocumentDtoShape),
    recentDraftInvoices: list(salesDashboardDocumentDtoShape),
    generatedAt: textField,
  });

/**
 * Validates the complete SalesDashboardDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const salesDashboard: Decoder<SalesDashboardDto> = responseDto(
  salesDashboardDtoShape,
);
