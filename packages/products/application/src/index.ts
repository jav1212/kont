import type { CompanyId } from "@kontave/companies-domain";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";
import {
  Product,
  ProductCategory,
  ProductCategoryStatus,
  ProductFailure,
  ProductStatus,
  type Barcode,
  type ProductCategoryId,
  type ProductId,
  type Sku,
  type UnitOfMeasure,
} from "@kontave/products-domain";

export type ProductStockFilter = "all" | "available" | "low" | "out";
export type ProductListSort = "name" | "sku" | "stock" | "value" | "updatedAt";
export type SortDirection = "asc" | "desc";
export interface ProductCatalogContext { readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly companyId: CompanyId }
export interface ProductListQuery extends ProductCatalogContext {
  readonly search: string | null; readonly status: ProductStatus | "all"; readonly categoryId: ProductCategoryId | null;
  readonly stock: ProductStockFilter; readonly sort: ProductListSort; readonly direction: SortDirection;
  readonly cursor: string | null; readonly limit: number;
}
export interface ProductInventorySummary {
  readonly onHand: { readonly quantity: string; readonly unit: UnitOfMeasure };
  readonly replenishment: { readonly minimumQuantity: string | null; readonly state: "available" | "low" | "out"; readonly version: number; readonly updatedAt: string };
  readonly valuation: { readonly unitCost: string; readonly totalValue: string; readonly currency: "VES" };
}
export interface ProductListItem {
  readonly product: Product; readonly category: ProductCategory | null; readonly inventory: ProductInventorySummary | null; readonly updatedAt: string;
}
export interface ProductListSummary {
  readonly active: number; readonly inactive: number; readonly lowStock: number; readonly outOfStock: number;
  readonly inventoryValue: { readonly amount: string; readonly currency: "VES" };
}
export interface ProductCursorPage { readonly items: readonly ProductListItem[]; readonly nextCursor: string | null; readonly total: number; readonly summary: ProductListSummary }
export interface ProductDetail {
  readonly product: Product; readonly category: ProductCategory | null; readonly inventory: ProductInventorySummary | null; readonly updatedAt: string;
  readonly capabilities: { readonly inventoryEnabled: boolean; readonly locationTracking: boolean; readonly lotTracking: boolean };
}
export interface ProductMovementQuery extends ProductCatalogContext {
  readonly productId: ProductId; readonly cursor: string | null; readonly limit: number; readonly from: string | null; readonly to: string | null;
  readonly type: string | null; readonly locationId: string | null;
}
export interface ProductMovement {
  readonly id: string; readonly effectiveDate: string; readonly type: string;
  readonly quantity: { readonly value: string; readonly unit: UnitOfMeasure };
  readonly unitCost: { readonly amount: string; readonly currency: "VES" };
  readonly totalCost: { readonly amount: string; readonly currency: "VES" };
  readonly balanceQuantity: string; readonly reference: string | null; readonly notes: string | null; readonly createdAt: string;
}
export interface ProductMovementPage { readonly items: readonly ProductMovement[]; readonly nextCursor: string | null }
export interface CreateProductCommand extends ProductCatalogContext {
  readonly sku: Sku; readonly barcodes: readonly Barcode[]; readonly name: string; readonly description: string | null;
  readonly categoryId: ProductCategoryId | null; readonly baseUnit: UnitOfMeasure;
}
export interface UpdateProductCommand extends ProductCatalogContext {
  readonly productId: ProductId; readonly sku?: Sku; readonly barcodes?: readonly Barcode[]; readonly name?: string;
  readonly description?: string | null; readonly categoryId?: ProductCategoryId | null; readonly baseUnit?: UnitOfMeasure; readonly expectedVersion: number;
}
export interface ProductVersionCommand extends ProductCatalogContext { readonly productId: ProductId; readonly expectedVersion: number }
export interface ProductCategoryListQuery extends ProductCatalogContext { readonly status: ProductCategoryStatus | "all" }
export interface CreateProductCategoryCommand extends ProductCatalogContext { readonly name: string; readonly description: string | null }
export interface UpdateProductCategoryCommand extends ProductCatalogContext { readonly categoryId: ProductCategoryId; readonly name?: string; readonly description?: string | null; readonly expectedVersion: number }
export interface ProductCategoryVersionCommand extends ProductCatalogContext { readonly categoryId: ProductCategoryId; readonly expectedVersion: number }

export interface ProductsRepository {
  list(query: ProductListQuery): Promise<ProductCursorPage>;
  get(context: ProductCatalogContext, productId: ProductId): Promise<ProductDetail | null>;
  create(command: CreateProductCommand): Promise<ProductDetail>;
  update(command: UpdateProductCommand): Promise<ProductDetail>;
  setStatus(command: ProductVersionCommand, status: ProductStatus): Promise<ProductDetail>;
  listMovements(query: ProductMovementQuery): Promise<ProductMovementPage>;
  listCategories(query: ProductCategoryListQuery): Promise<readonly ProductCategory[]>;
  createCategory(command: CreateProductCategoryCommand): Promise<ProductCategory>;
  updateCategory(command: UpdateProductCategoryCommand): Promise<ProductCategory>;
  setCategoryStatus(command: ProductCategoryVersionCommand, status: ProductCategoryStatus): Promise<ProductCategory>;
}

export class ListProducts { constructor(private readonly repository: ProductsRepository) {} execute(query: ProductListQuery) { return this.repository.list(validateList(query)); } }
export class GetProduct { constructor(private readonly repository: ProductsRepository) {} async execute(context: ProductCatalogContext, id: ProductId) { const value=await this.repository.get(context,id);if(!value)throw new ProductFailure("PRODUCT_NOT_FOUND","Product was not found.");return value; } }
export class CreateProduct { constructor(private readonly repository: ProductsRepository) {} execute(command: CreateProductCommand) { validateBarcodes(command.barcodes);return this.repository.create(command); } }
export class UpdateProduct { constructor(private readonly repository: ProductsRepository) {} execute(command: UpdateProductCommand) { expectedVersion(command.expectedVersion);if(command.barcodes)validateBarcodes(command.barcodes);return this.repository.update(command); } }
export class SetProductStatus { constructor(private readonly repository: ProductsRepository,private readonly status:ProductStatus) {} execute(command: ProductVersionCommand) { expectedVersion(command.expectedVersion);return this.repository.setStatus(command,this.status); } }
export class ListProductMovements { constructor(private readonly repository: ProductsRepository) {} execute(query: ProductMovementQuery) { return this.repository.listMovements(validateMovement(query)); } }
export class ListProductCategories { constructor(private readonly repository: ProductsRepository) {} execute(query: ProductCategoryListQuery) { return this.repository.listCategories(query); } }
export class CreateProductCategory { constructor(private readonly repository: ProductsRepository) {} execute(command: CreateProductCategoryCommand) { return this.repository.createCategory(command); } }
export class UpdateProductCategory { constructor(private readonly repository: ProductsRepository) {} execute(command: UpdateProductCategoryCommand) { expectedVersion(command.expectedVersion);return this.repository.updateCategory(command); } }
export class SetProductCategoryStatus { constructor(private readonly repository: ProductsRepository,private readonly status:ProductCategoryStatus) {} execute(command: ProductCategoryVersionCommand) { expectedVersion(command.expectedVersion);return this.repository.setCategoryStatus(command,this.status); } }

function validateList(query:ProductListQuery):ProductListQuery{if(!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>100)invalid("Product page limit must be between 1 and 100.");if(query.search!==null&&query.search.trim().length>200)invalid("Product search is invalid.");return Object.freeze({...query,search:query.search?.trim()||null});}
function validateMovement(query:ProductMovementQuery):ProductMovementQuery{if(!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>100)invalid("Movement page limit must be between 1 and 100.");if(query.from&&query.to&&query.from>query.to)invalid("Movement start date must not be after its end date.");return query;}
function validateBarcodes(values:readonly Barcode[]){if(new Set<string>(values).size!==values.length)throw new ProductFailure("PRODUCT_DUPLICATE_BARCODE","A product cannot contain duplicate barcodes.");}
function expectedVersion(value:number){if(!Number.isSafeInteger(value)||value<1)invalid("Expected version is invalid.");}
function invalid(message:string):never{throw new ProductFailure("PRODUCT_INVALID",message);}

export { ProductStatus, ProductCategoryStatus };
