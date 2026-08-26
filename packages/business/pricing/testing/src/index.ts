import { companyId } from "@kontave/companies/domain";
import { currencyCode } from "@kontave/monetary-domain";
import { fixedSalePricing, ProductSalePricing } from "@kontave/pricing-domain";
import { productId } from "@kontave/products-domain";

/**
 * Builds deterministic sale-pricing state for collaborating-context tests.
 * @returns A validated fixed-price aggregate denominated in USD.
 */
export function productSalePricingFixture(): ProductSalePricing {
  return new ProductSalePricing({
    companyId: companyId("company-1"),
    productId: productId("product-1"),
    policy: fixedSalePricing("10", currencyCode("USD")),
    version: 1,
    updatedAt: "2026-08-16T00:00:00.000Z",
  });
}
