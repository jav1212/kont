import type {
  ProductCategoryDto,
  ProductCategoryOverviewDto,
  ProductCategoryOverviewItemDto,
  ProductDetailDto,
  ProductDto,
  ProductInventorySummaryDto,
  ProductListDto,
  ProductMovementDto,
  ProductMovementPageDto,
  ProductReplenishmentPolicyDto,
  ProductSalePricingDto,
  ProductSalePricingPolicyDto,
  ProductTaxationDto,
  ProductUnitEconomicsAggregateDto,
  ProductUnitEconomicsDto,
  UnitOfMeasure,
} from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  shape as fields,
  nullOr as nullable,
  list as array,
  literal as literals,
  responseDto as decoder,
  textField as text,
  numberField as number,
  booleanField as boolean,
  type ResponseField as Guard,
} from "../../response-shape";

type Fields<T> = { readonly [K in keyof T]-?: Guard<T[K]> };

const unit: Guard<UnitOfMeasure> = literals(
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
const status = literals("active", "inactive");
const functionalMoney = fields<{
  readonly amount: string;
  readonly currency: "VES";
}>({
  amount: text,
  currency: literals("VES"),
});
const quantity = fields<{
  readonly value: string;
  readonly unit: UnitOfMeasure;
}>({
  value: text,
  unit,
});

const categoryFields: Fields<ProductCategoryDto> = {
  id: text,
  name: text,
  description: nullable(text),
  status,
  version: number,
};
const categoryGuard = fields<ProductCategoryDto>(categoryFields);
const categoryOverviewItemGuard = fields<ProductCategoryOverviewItemDto>({
  ...categoryFields,
  productCount: number,
  createdAt: nullable(text),
  updatedAt: nullable(text),
});
const inventory = fields<ProductInventorySummaryDto>({
  onHand: fields<ProductInventorySummaryDto["onHand"]>({
    quantity: text,
    unit,
  }),
  replenishment: fields<ProductInventorySummaryDto["replenishment"]>({
    minimumQuantity: nullable(text),
    state: literals("available", "low", "out"),
    version: number,
    updatedAt: text,
  }),
  valuation: fields<ProductInventorySummaryDto["valuation"]>({
    unitCost: text,
    totalValue: text,
    currency: literals("VES"),
  }),
});
const productFields: Fields<ProductDto> = {
  id: text,
  sku: text,
  barcodes: array(text),
  name: text,
  description: nullable(text),
  category: nullable(categoryGuard),
  baseUnit: unit,
  status,
  inventory: nullable(inventory),
  updatedAt: text,
  version: number,
};
const productGuard = fields<ProductDto>(productFields);
const fixedPricing = fields<
  Extract<ProductSalePricingPolicyDto, { readonly mode: "fixed" }>
>({
  mode: literals("fixed"),
  amount: text,
  currency: text,
});
const markupPricing = fields<
  Extract<ProductSalePricingPolicyDto, { readonly mode: "markup" }>
>({
  mode: literals("markup"),
  percentage: text,
  currency: text,
});
const pricingPolicy: Guard<ProductSalePricingPolicyDto> = (
  value,
): value is ProductSalePricingPolicyDto =>
  fixedPricing(value) || markupPricing(value);
const salePricingGuard = fields<ProductSalePricingDto>({
  policy: nullable(pricingPolicy),
  version: number,
  updatedAt: text,
});
const taxationGuard = fields<ProductTaxationDto>({
  profileId: text,
  taxCode: text,
  treatment: literals("taxed", "exempt", "exonerated", "not_subject"),
  effectiveFrom: text,
  effectiveTo: nullable(text),
  resolvedRate: text,
  legalBasis: text,
  ruleVersion: text,
  version: number,
});
const movement = fields<ProductMovementDto>({
  id: text,
  effectiveDate: text,
  type: text,
  quantity,
  unitCost: functionalMoney,
  totalCost: functionalMoney,
  balanceQuantity: text,
  reference: nullable(text),
  notes: nullable(text),
  createdAt: text,
});
const aggregate = fields<ProductUnitEconomicsAggregateDto>({
  weightedAverageUnitAmount: functionalMoney,
  quantity,
  observations: number,
});

/**
 * Validates a product response without coercing monetary strings or dropping extensions.
 * @param value - Untrusted Client API data.
 * @returns The original product DTO, or null when its structure is incompatible.
 */
export const product: Decoder<ProductDto> = decoder(productGuard);

/**
 * Validates a product page, including each item and its summary.
 * @param value - Untrusted Client API data.
 * @returns The original product page, or null when any required field is invalid.
 */
export const productList: Decoder<ProductListDto> = decoder(
  fields<ProductListDto>({
    items: array(productGuard),
    nextCursor: nullable(text),
    total: number,
    summary: fields<ProductListDto["summary"]>({
      active: number,
      inactive: number,
      lowStock: number,
      outOfStock: number,
      inventoryValue: functionalMoney,
    }),
  }),
);

/**
 * Validates product details and the current commercial and inventory capabilities.
 * @param value - Untrusted Client API data.
 * @returns The original detail DTO, or null when it violates the current contract.
 */
export const productDetail: Decoder<ProductDetailDto> = decoder(
  fields<ProductDetailDto>({
    ...productFields,
    salePricing: nullable(salePricingGuard),
    taxation: nullable(taxationGuard),
    productType: literals("merchandise"),
    valuationMethod: literals("weighted_average"),
    vat: nullable(
      fields<NonNullable<ProductDetailDto["vat"]>>({
        code: literals("general", "exempt"),
        rate: text,
      }),
    ),
    capabilities: fields<ProductDetailDto["capabilities"]>({
      inventoryEnabled: boolean,
      locationTracking: boolean,
      lotTracking: boolean,
      salePricing: boolean,
      vatConfiguration: boolean,
      valuationMethodChange: boolean,
    }),
  }),
);

/**
 * Validates a movement page and its exact monetary and quantity values.
 * @param value - Untrusted Client API data.
 * @returns The original page, or null when any movement or pagination field is invalid.
 */
export const productMovementPage: Decoder<ProductMovementPageDto> = decoder(
  fields<ProductMovementPageDto>({
    items: array(movement),
    nextCursor: nullable(text),
  }),
);

/**
 * Validates an updated replenishment policy without adding stock constraints.
 * @param value - Untrusted Client API data.
 * @returns The original policy, or null when required fields have incompatible types.
 */
export const replenishmentPolicy: Decoder<ProductReplenishmentPolicyDto> =
  decoder(
    fields<ProductReplenishmentPolicyDto>({
      productId: text,
      unit,
      minimumQuantity: nullable(text),
      version: number,
      updatedAt: text,
    }),
  );

/**
 * Validates fixed, markup, and absent sale pricing policies.
 * @param value - Untrusted Client API data.
 * @returns The original pricing DTO, or null when its discriminated policy is invalid.
 */
export const salePricing: Decoder<ProductSalePricingDto> =
  decoder(salePricingGuard);

/**
 * Validates the product taxation response without applying tax policy rules.
 * @param value - Untrusted Client API data.
 * @returns The original taxation DTO, or null when it violates the response contract.
 */
export const taxation: Decoder<ProductTaxationDto> = decoder(taxationGuard);

/**
 * Validates a product category response.
 * @param value - Untrusted Client API data.
 * @returns The original category DTO, or null when a required field is invalid.
 */
export const category: Decoder<ProductCategoryDto> = decoder(categoryGuard);

/**
 * Validates category details including usage counts and nullable timestamps.
 * @param value - Untrusted Client API data.
 * @returns The original category details, or null when required metadata is invalid.
 */
export const categoryOverviewItem: Decoder<ProductCategoryOverviewItemDto> =
  decoder(categoryOverviewItemGuard);

/**
 * Validates a category page and its usage summary.
 * @param value - Untrusted Client API data.
 * @returns The original category page, or null when any nested value is invalid.
 */
export const categoryOverview: Decoder<ProductCategoryOverviewDto> = decoder(
  fields<ProductCategoryOverviewDto>({
    items: array(categoryOverviewItemGuard),
    nextCursor: nullable(text),
    total: number,
    summary: fields<ProductCategoryOverviewDto["summary"]>({
      active: number,
      inactive: number,
      inUse: number,
      unused: number,
      unassignedProducts: number,
    }),
  }),
);

/**
 * Validates historical acquisition and sales metrics, preserving exact decimal strings.
 * @param value - Untrusted Client API data.
 * @returns The original economics DTO, or null when the response is structurally invalid.
 */
export const unitEconomics: Decoder<ProductUnitEconomicsDto> = decoder(
  fields<ProductUnitEconomicsDto>({
    period: fields<ProductUnitEconomicsDto["period"]>({
      from: text,
      to: text,
      granularity: literals("day", "week", "month"),
    }),
    latestAcquisition: nullable(
      fields<NonNullable<ProductUnitEconomicsDto["latestAcquisition"]>>({
        effectiveDate: text,
        sourceUnitAmount: fields<{
          readonly amount: string;
          readonly currency: string;
        }>({ amount: text, currency: text }),
        unitAmount: functionalMoney,
        exchangeRate: nullable(text),
        quantity,
        reference: nullable(text),
        documentId: text,
      }),
    ),
    points: array(
      fields<ProductUnitEconomicsDto["points"][number]>({
        bucketStart: text,
        acquisition: nullable(aggregate),
        realizedSale: nullable(aggregate),
      }),
    ),
    coverage: fields<ProductUnitEconomicsDto["coverage"]>({
      confirmedAcquisitions: number,
      confirmedSales: number,
      legacyRecordedOutboundPrices: number,
    }),
    generatedAt: text,
  }),
);
