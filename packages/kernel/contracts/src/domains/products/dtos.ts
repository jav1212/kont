export type UnitOfMeasure =
  | "each"
  | "kilogram"
  | "gram"
  | "meter"
  | "square_meter"
  | "cubic_meter"
  | "liter"
  | "gallon"
  | "box"
  | "roll"
  | "package";
export interface ProductCategoryDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: "active" | "inactive";
  readonly version: number;
}
export interface ProductCategoryOverviewItemDto extends ProductCategoryDto {
  readonly productCount: number;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
}
export interface ProductCategoryOverviewDto {
  readonly items: readonly ProductCategoryOverviewItemDto[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly summary: {
    readonly active: number;
    readonly inactive: number;
    readonly inUse: number;
    readonly unused: number;
    readonly unassignedProducts: number;
  };
}
export interface ProductInventorySummaryDto {
  readonly onHand: { readonly quantity: string; readonly unit: UnitOfMeasure };
  readonly replenishment: {
    readonly minimumQuantity: string | null;
    readonly state: "available" | "low" | "out";
    readonly version: number;
    readonly updatedAt: string;
  };
  readonly valuation: {
    readonly unitCost: string;
    readonly totalValue: string;
    readonly currency: "VES";
  };
}
export interface ProductDto {
  readonly id: string;
  readonly sku: string;
  readonly barcodes: readonly string[];
  readonly name: string;
  readonly description: string | null;
  readonly category: ProductCategoryDto | null;
  readonly baseUnit: UnitOfMeasure;
  readonly status: "active" | "inactive";
  readonly inventory: ProductInventorySummaryDto | null;
  readonly updatedAt: string;
  readonly version: number;
}
export interface ProductListDto {
  readonly items: readonly ProductDto[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly summary: {
    readonly active: number;
    readonly inactive: number;
    readonly lowStock: number;
    readonly outOfStock: number;
    readonly inventoryValue: {
      readonly amount: string;
      readonly currency: "VES";
    };
  };
}
export type ProductSalePricingPolicyDto =
  | {
      readonly mode: "fixed";
      readonly amount: string;
      readonly currency: string;
    }
  | {
      readonly mode: "markup";
      readonly percentage: string;
      readonly currency: string;
    };
export interface ProductSalePricingDto {
  readonly policy: ProductSalePricingPolicyDto | null;
  readonly version: number;
  readonly updatedAt: string;
}
export interface UpdateProductSalePricingDto {
  readonly policy: ProductSalePricingPolicyDto | null;
  readonly expectedVersion: number;
}
export interface ProductTaxationDto {
  readonly profileId: string;
  readonly taxCode: string;
  readonly treatment: "taxed" | "exempt" | "exonerated" | "not_subject";
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly resolvedRate: string;
  readonly legalBasis: string;
  readonly ruleVersion: string;
  readonly version: number;
}
export interface UpdateProductTaxationDto {
  readonly treatment: "taxed" | "exempt" | "exonerated" | "not_subject";
  readonly effectiveFrom: string;
  readonly legalBasis: string;
  readonly expectedVersion: number;
}
export interface ProductUnitEconomicsAggregateDto {
  readonly weightedAverageUnitAmount: {
    readonly amount: string;
    readonly currency: "VES";
  };
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly observations: number;
}
export interface ProductUnitEconomicsDto {
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly granularity: "day" | "week" | "month";
  };
  readonly latestAcquisition: {
    readonly effectiveDate: string;
    readonly sourceUnitAmount: {
      readonly amount: string;
      readonly currency: string;
    };
    readonly unitAmount: { readonly amount: string; readonly currency: "VES" };
    readonly exchangeRate: string | null;
    readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
    readonly reference: string | null;
    readonly documentId: string;
  } | null;
  readonly points: readonly {
    readonly bucketStart: string;
    readonly acquisition: ProductUnitEconomicsAggregateDto | null;
    readonly realizedSale: ProductUnitEconomicsAggregateDto | null;
  }[];
  readonly coverage: {
    readonly confirmedAcquisitions: number;
    readonly confirmedSales: number;
    readonly legacyRecordedOutboundPrices: number;
  };
  readonly generatedAt: string;
}
export interface ProductDetailDto extends ProductDto {
  readonly salePricing: ProductSalePricingDto | null;
  readonly taxation: ProductTaxationDto | null;
  readonly productType: "merchandise";
  readonly valuationMethod: "weighted_average";
  readonly vat: {
    readonly code: "general" | "exempt";
    readonly rate: string;
  } | null;
  readonly capabilities: {
    readonly inventoryEnabled: boolean;
    readonly locationTracking: boolean;
    readonly lotTracking: boolean;
    readonly salePricing: boolean;
    readonly vatConfiguration: boolean;
    readonly valuationMethodChange: boolean;
  };
}
export interface CreateProductDto {
  readonly sku: string;
  readonly barcodes?: readonly string[];
  readonly name: string;
  readonly description?: string | null;
  readonly categoryId?: string | null;
  readonly baseUnit: UnitOfMeasure;
}
export interface UpdateProductDto {
  readonly sku?: string;
  readonly barcodes?: readonly string[];
  readonly name?: string;
  readonly description?: string | null;
  readonly categoryId?: string | null;
  readonly baseUnit?: UnitOfMeasure;
  readonly expectedVersion: number;
}
export interface ProductVersionDto {
  readonly expectedVersion: number;
}
export interface UpdateProductInventoryProfileDto {
  readonly minimumQuantity: string | null;
  readonly expectedVersion: number;
}
export interface ProductReplenishmentPolicyDto {
  readonly productId: string;
  readonly unit: UnitOfMeasure;
  readonly minimumQuantity: string | null;
  readonly version: number;
  readonly updatedAt: string;
}
export interface CreateProductCategoryDto {
  readonly name: string;
  readonly description?: string | null;
}
export interface UpdateProductCategoryDto {
  readonly name?: string;
  readonly description?: string | null;
  readonly expectedVersion: number;
}
export interface ProductMovementDto {
  readonly id: string;
  readonly effectiveDate: string;
  readonly type: string;
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly unitCost: { readonly amount: string; readonly currency: "VES" };
  readonly totalCost: { readonly amount: string; readonly currency: "VES" };
  readonly balanceQuantity: string;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
}
export interface ProductMovementPageDto {
  readonly items: readonly ProductMovementDto[];
  readonly nextCursor: string | null;
}
