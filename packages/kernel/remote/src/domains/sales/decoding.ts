import type {
  SalesDashboardDto,
  SalesDashboardSummaryDto,
  SalesAmountDto,
  SalesDashboardDailyPointDto,
  SalesDashboardDocumentDto,
  SalesPerformanceReportDto,
  SalesPerformanceRowDto,
} from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  textField,
  numberField,
  booleanField,
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

const salesPerformanceRowDtoShape: ResponseField<SalesPerformanceRowDto> = shape<SalesPerformanceRowDto>({
  key: textField,
  label: textField,
  attributed: booleanField,
  invoiceCount: numberField,
  grossAmount: salesAmountDtoShape,
});
const salesPerformanceReportDtoShape: ResponseField<SalesPerformanceReportDto> = shape<SalesPerformanceReportDto>({
  period: shape({ from: textField, to: textField }),
  dimension: literal("user", "role", "device"),
  currency: literal("VES"),
  rows: list(salesPerformanceRowDtoShape),
  generatedAt: textField,
});

/**
 * Validates a sales performance report response.
 * @param value Untrusted response data.
 * @returns The validated report, preserving serialized monetary amounts, or null when malformed.
 */
export const salesPerformanceReport: Decoder<SalesPerformanceReportDto> = responseDto(
  salesPerformanceReportDtoShape,
);
