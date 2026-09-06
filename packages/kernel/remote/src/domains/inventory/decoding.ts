import type {
  InventoryDashboardDto,
  InventoryDashboardSummaryDto,
  InventoryAmountDto,
  InventoryUnitFlowDto,
  InventoryDashboardChartPointDto,
  RecentInventoryDocumentDto,
  RecentInventoryMovementDto,
  UnitOfMeasure,
  InventoryFlowPageDto,
  InventoryFlowItemDto,
  InventoryOperationReason,
  InventoryOperationStatus,
  InventoryOperationSourceKind,
  InventoryOperationDetailDto,
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

const inventoryAmountDtoShape: ResponseField<InventoryAmountDto> =
  shape<InventoryAmountDto>({
    amount: textField,
    currency: literal("VES"),
  });

const inventoryUnitFlowDtoShape: ResponseField<InventoryUnitFlowDto> =
  shape<InventoryUnitFlowDto>({
    unit: textField,
    inbound: textField,
    outbound: textField,
  });

const inventoryDashboardSummaryDtoShape: ResponseField<InventoryDashboardSummaryDto> =
  shape<InventoryDashboardSummaryDto>({
    inboundValue: inventoryAmountDtoShape,
    outboundValue: inventoryAmountDtoShape,
    movementCount: numberField,
    inventoryValue: inventoryAmountDtoShape,
    quantities: list(inventoryUnitFlowDtoShape),
    valuationDate: textField,
  });

const inventoryDashboardChartPointDtoShape: ResponseField<InventoryDashboardChartPointDto> =
  shape<InventoryDashboardChartPointDto>({
    date: textField,
    inboundValue: inventoryAmountDtoShape,
    outboundValue: inventoryAmountDtoShape,
    movementCount: numberField,
    quantities: list(inventoryUnitFlowDtoShape),
  });

const recentInventoryDocumentDtoShape: ResponseField<RecentInventoryDocumentDto> =
  shape<RecentInventoryDocumentDto>({
    id: textField,
    recordType: literal(
      "invoice",
      "delivery_note",
      "debit_note",
      "credit_note",
      "other",
    ),
    number: textField,
    counterparty: nullOr(textField),
    date: textField,
    status: textField,
    total: inventoryAmountDtoShape,
    transactionCurrency: textField,
    sourceTotal: nullOr(textField),
  });

const unitOfMeasureShape: ResponseField<UnitOfMeasure> = literal(
  "each",
  "kilogram",
  "gram",
  "meter",
  "square_meter",
  "cubic_meter",
  "liter",
  "gallon",
  "box",
  "roll",
  "package",
);

const recentInventoryMovementDtoShape: ResponseField<RecentInventoryMovementDto> =
  shape<RecentInventoryMovementDto>({
    id: textField,
    productId: textField,
    productName: textField,
    productSku: textField,
    effectiveDate: textField,
    movementType: textField,
    direction: literal("inbound", "outbound"),
    quantity: shape({
      value: textField,
      unit: unitOfMeasureShape,
    }),
    totalCost: inventoryAmountDtoShape,
    reference: nullOr(textField),
  });

const inventoryDashboardDtoShape: ResponseField<InventoryDashboardDto> =
  shape<InventoryDashboardDto>({
    period: shape({
      from: textField,
      to: textField,
      granularity: literal("day"),
    }),
    summary: inventoryDashboardSummaryDtoShape,
    charts: list(inventoryDashboardChartPointDtoShape),
    recentSales: list(recentInventoryDocumentDtoShape),
    recentPurchases: list(recentInventoryDocumentDtoShape),
    recentInboundMovements: list(recentInventoryMovementDtoShape),
    recentOutboundMovements: list(recentInventoryMovementDtoShape),
    generatedAt: textField,
  });

const inventoryOperationReasonShape: ResponseField<InventoryOperationReason> =
  literal(
    "opening_balance",
    "purchase_receipt",
    "sales_issue",
    "customer_return",
    "supplier_return",
    "transfer",
    "stock_count_adjustment",
    "self_consumption",
    "production_consumption",
    "production_output",
    "reversal",
  );

const inventoryOperationStatusShape: ResponseField<InventoryOperationStatus> =
  literal("draft", "posted", "reversed");

const inventoryOperationSourceKindShape: ResponseField<InventoryOperationSourceKind> =
  literal("purchasing", "sales", "inventory", "production", "migration");

const inventoryFlowItemDtoShape: ResponseField<InventoryFlowItemDto> =
  shape<InventoryFlowItemDto>({
    id: textField,
    operationId: textField,
    effectiveDate: textField,
    direction: literal("inbound", "outbound"),
    reason: inventoryOperationReasonShape,
    status: inventoryOperationStatusShape,
    product: shape({
      id: textField,
      sku: textField,
      name: textField,
    }),
    quantity: shape({
      value: textField,
      unit: unitOfMeasureShape,
    }),
    unitCost: nullOr(inventoryAmountDtoShape),
    totalCost: nullOr(inventoryAmountDtoShape),
    source: shape({
      kind: inventoryOperationSourceKindShape,
      documentId: textField,
    }),
    reference: nullOr(textField),
    notes: nullOr(textField),
    postedAt: nullOr(textField),
  });

const inventoryFlowPageDtoShape: ResponseField<InventoryFlowPageDto> =
  shape<InventoryFlowPageDto>({
    items: list(inventoryFlowItemDtoShape),
    nextCursor: nullOr(textField),
    total: numberField,
    summary: shape({
      movementCount: numberField,
      totalValue: inventoryAmountDtoShape,
      quantities: list(
        shape({
          unit: unitOfMeasureShape,
          value: textField,
        }),
      ),
    }),
  });

const inventoryOperationDetailDtoShape: ResponseField<InventoryOperationDetailDto> =
  shape<InventoryOperationDetailDto>({
    id: textField,
    companyId: textField,
    reason: inventoryOperationReasonShape,
    effectiveDate: textField,
    status: inventoryOperationStatusShape,
    version: numberField,
    source: shape({
      kind: inventoryOperationSourceKindShape,
      documentId: textField,
    }),
    reference: nullOr(textField),
    notes: nullOr(textField),
    postedAt: nullOr(textField),
    reversalOf: nullOr(textField),
    reversedBy: nullOr(textField),
    lines: list(
      shape({
        id: textField,
        productId: textField,
        productName: textField,
        productSku: textField,
        direction: literal("inbound", "outbound"),
        quantity: shape({
          value: textField,
          unit: unitOfMeasureShape,
        }),
        unitCost: nullOr(inventoryAmountDtoShape),
        movementId: nullOr(textField),
      }),
    ),
    capabilities: shape({
      canPost: booleanField,
      canReverse: booleanField,
      canEditMetadata: booleanField,
    }),
  });

/**
 * Validates the complete InventoryDashboardDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const inventoryDashboard: Decoder<InventoryDashboardDto> = responseDto(
  inventoryDashboardDtoShape,
);

/**
 * Validates the complete InventoryFlowPageDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const inventoryFlowPage: Decoder<InventoryFlowPageDto> = responseDto(
  inventoryFlowPageDtoShape,
);

/**
 * Validates the complete InventoryOperationDetailDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const inventoryOperation: Decoder<InventoryOperationDetailDto> =
  responseDto(inventoryOperationDetailDtoShape);
