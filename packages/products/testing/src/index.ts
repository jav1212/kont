import { companyId } from "@kontave/companies-domain";
import { Product, ProductStatus, UnitOfMeasure, barcode, productId, sku } from "@kontave/products-domain";

export const PRODUCTS_COMPANY_ID = companyId("products-company-1");

export function productFixture(overrides: Partial<ConstructorParameters<typeof Product>[0]> = {}): Product {
  return new Product({ id: productId("product-1"), companyId: PRODUCTS_COMPANY_ID, legacyProductId: null, sku: sku("SKU-001"), barcodes: [barcode("001234567890")], name: "Canonical product", description: null, categoryId: null, baseUnit: UnitOfMeasure.Each, status: ProductStatus.Active, version: 1, ...overrides });
}
