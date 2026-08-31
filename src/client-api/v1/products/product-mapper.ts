import type {
  ProductCategoryOverviewItem,
  ProductCategoryOverviewPage,
  ProductCursorPage,
  ProductDetail,
} from "@kontave/products/application";
import type { ProductCategory } from "@kontave/products/domain";
import type {
  ProductCategoryDto,
  ProductCategoryOverviewDto,
  ProductCategoryOverviewItemDto,
  ProductDetailDto,
  ProductDto,
  ProductListDto,
} from "@kontave/client-contracts";
import type { ProductSalePricing } from "@kontave/pricing/domain";
import type { ResolvedProductTaxation } from "@kontave/taxation/application";
export function toProductCategoryDto(
  value: ProductCategory,
): ProductCategoryDto {
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    status: value.status,
    version: value.version,
  };
}
export function toProductCategoryOverviewItemDto(
  value: ProductCategoryOverviewItem,
): ProductCategoryOverviewItemDto {
  return {
    ...toProductCategoryDto(value.category),
    productCount: value.productCount,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
export function toProductCategoryOverviewDto(
  value: ProductCategoryOverviewPage,
): ProductCategoryOverviewDto {
  return { ...value, items: value.items.map(toProductCategoryOverviewItemDto) };
}
export function toProductDto(value: ProductDetail): ProductDto {
  return {
    id: value.product.id,
    sku: value.product.sku,
    barcodes: value.product.barcodes,
    name: value.product.name,
    description: value.product.description,
    category: value.category ? toProductCategoryDto(value.category) : null,
    baseUnit: value.product.baseUnit,
    status: value.product.status,
    inventory: value.inventory,
    updatedAt: value.updatedAt,
    version: value.product.version,
  };
}
export function toProductDetailDto(
  value: ProductDetail,
  commercial?: {
    readonly pricing: ProductSalePricing;
    readonly taxation: ResolvedProductTaxation;
  },
): ProductDetailDto {
  const taxation = commercial?.taxation,
    treatment = taxation?.assignment.treatment;
  return {
    ...toProductDto(value),
    salePricing: commercial
      ? {
          policy: commercial.pricing.policy,
          version: commercial.pricing.version,
          updatedAt: commercial.pricing.updatedAt,
        }
      : null,
    taxation: taxation
      ? {
          profileId: taxation.profile.id,
          taxCode: taxation.assignment.taxCode,
          treatment: taxation.assignment.treatment,
          resolvedRate: taxation.rule.rate,
          effectiveFrom: taxation.assignment.effectiveFrom,
          effectiveTo: taxation.assignment.effectiveTo,
          legalBasis: taxation.assignment.legalBasis,
          ruleVersion: `${taxation.assignment.classificationVersion}|${taxation.rule.version}`,
          version: taxation.profile.version,
        }
      : null,
    productType: "merchandise",
    valuationMethod: "weighted_average",
    vat:
      taxation && (treatment === "taxed" || treatment === "exempt")
        ? {
            code: treatment === "exempt" ? "exempt" : "general",
            rate: taxation.rule.rate,
          }
        : null,
    capabilities: {
      ...value.capabilities,
      salePricing: commercial !== undefined,
      vatConfiguration: taxation !== undefined,
      valuationMethodChange: false,
    },
  };
}
export function toProductListDto(value: ProductCursorPage): ProductListDto {
  return {
    items: value.items.map((item) =>
      toProductDto({
        ...item,
        capabilities: {
          inventoryEnabled: item.inventory !== null,
          locationTracking: false,
          lotTracking: false,
        },
      }),
    ),
    nextCursor: value.nextCursor,
    total: value.total,
    summary: value.summary,
  };
}
