import { KontaveRemoteClient, KontaveRemoteFailure, RemoteProductsPort } from "@kontave/client-remote";
import type {
  CreateProductCategoryDto, CreateProductDto, ProductCategoryDto, ProductCategoryOverviewDto, ProductCategoryOverviewItemDto, ProductDetailDto,
  ProductDto, ProductListDto, ProductMovementPageDto, ProductReplenishmentPolicyDto, ProductSalePricingDto, ProductTaxationDto, ProductUnitEconomicsDto,
  UpdateProductCategoryDto, UpdateProductDto, UpdateProductInventoryProfileDto, UpdateProductSalePricingDto, UpdateProductTaxationDto,
} from "@kontave/client-contracts";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request";
import type { DesktopProductCategoryOverviewQuery, DesktopProductInsightsQuery, DesktopProductListQuery, DesktopProductMovementQuery, DesktopProductsResult } from "../../shared/desktop-api";

export class DesktopProductsController {
  private readonly products: RemoteProductsPort;

  constructor(baseUrl: string, authenticatedRequest: DesktopAuthenticatedRequest) {
    this.products = new RemoteProductsPort(new KontaveRemoteClient({ baseUrl, platform: "desktop", authenticatedRequest: (input, init) => authenticatedRequest.fetch(input, init) }));
  }

  list(organizationId: unknown, companyId: unknown, query: unknown): Promise<DesktopProductsResult<ProductListDto>> {
    return this.read(() => this.products.list(segment(organizationId), segment(companyId), readListQuery(query)));
  }

  permissions(organizationId: unknown): Promise<DesktopProductsResult<readonly string[]>> {
    return this.read(() => this.products.permissions(segment(organizationId)));
  }

  get(organizationId: unknown, companyId: unknown, productId: unknown): Promise<DesktopProductsResult<ProductDetailDto>> {
    return this.read(() => this.products.get(segment(organizationId), segment(companyId), segment(productId)));
  }

  create(organizationId: unknown, companyId: unknown, command: CreateProductDto): Promise<DesktopProductsResult<ProductDto>> {
    return this.write(() => this.products.create(segment(organizationId), segment(companyId), command));
  }

  update(organizationId: unknown, companyId: unknown, productId: unknown, command: UpdateProductDto): Promise<DesktopProductsResult<ProductDto>> {
    return this.write(() => this.products.update(segment(organizationId), segment(companyId), segment(productId), command));
  }

  setStatus(organizationId: unknown, companyId: unknown, productId: unknown, active: boolean, expectedVersion: number): Promise<DesktopProductsResult<ProductDto>> {
    return this.write(() => this.products.setStatus(segment(organizationId), segment(companyId), segment(productId), active, expectedVersion));
  }

  movements(organizationId: unknown, companyId: unknown, productId: unknown, query: unknown): Promise<DesktopProductsResult<ProductMovementPageDto>> {
    return this.read(() => this.products.movements(segment(organizationId), segment(companyId), segment(productId), readMovementQuery(query)));
  }

  updateInventoryProfile(organizationId: unknown, companyId: unknown, productId: unknown, command: UpdateProductInventoryProfileDto): Promise<DesktopProductsResult<ProductReplenishmentPolicyDto>> {
    return this.write(() => this.products.updateInventoryProfile(segment(organizationId), segment(companyId), segment(productId), command));
  }

  categories(organizationId: unknown, companyId: unknown, status: unknown): Promise<DesktopProductsResult<readonly ProductCategoryDto[]>> {
    const normalized = status === "inactive" || status === "all" ? status : "active";
    return this.read(() => this.products.categories(segment(organizationId), segment(companyId), normalized));
  }

  categoryOverview(organizationId:unknown,companyId:unknown,query:unknown):Promise<DesktopProductsResult<ProductCategoryOverviewDto>>{
    return this.read(()=>this.products.categoryOverview(segment(organizationId),segment(companyId),readCategoryOverviewQuery(query)));
  }

  getCategory(organizationId:unknown,companyId:unknown,categoryId:unknown):Promise<DesktopProductsResult<ProductCategoryOverviewItemDto>>{
    return this.read(()=>this.products.getCategory(segment(organizationId),segment(companyId),segment(categoryId)));
  }

  unitEconomics(organizationId:unknown,companyId:unknown,productId:unknown,query:DesktopProductInsightsQuery):Promise<DesktopProductsResult<ProductUnitEconomicsDto>>{return this.read(()=>this.products.unitEconomics(segment(organizationId),segment(companyId),segment(productId),query));}
  updateSalePricing(organizationId:unknown,companyId:unknown,productId:unknown,command:UpdateProductSalePricingDto):Promise<DesktopProductsResult<ProductSalePricingDto>>{return this.write(()=>this.products.updateSalePricing(segment(organizationId),segment(companyId),segment(productId),command));}
  updateTaxation(organizationId:unknown,companyId:unknown,productId:unknown,command:UpdateProductTaxationDto):Promise<DesktopProductsResult<ProductTaxationDto>>{return this.write(()=>this.products.updateTaxation(segment(organizationId),segment(companyId),segment(productId),command));}

  createCategory(organizationId: unknown, companyId: unknown, command: CreateProductCategoryDto): Promise<DesktopProductsResult<ProductCategoryDto>> {
    return this.write(() => this.products.createCategory(segment(organizationId), segment(companyId), command));
  }

  updateCategory(organizationId: unknown, companyId: unknown, categoryId: unknown, command: UpdateProductCategoryDto): Promise<DesktopProductsResult<ProductCategoryDto>> {
    return this.write(() => this.products.updateCategory(segment(organizationId), segment(companyId), segment(categoryId), command));
  }

  setCategoryStatus(organizationId: unknown, companyId: unknown, categoryId: unknown, active: boolean, expectedVersion: number): Promise<DesktopProductsResult<ProductCategoryDto>> {
    return this.write(() => this.products.setCategoryStatus(segment(organizationId), segment(companyId), segment(categoryId), active, expectedVersion));
  }

  private async read<T>(operation: () => Promise<T>): Promise<DesktopProductsResult<T>> { return execute(operation); }
  private async write<T>(operation: () => Promise<T>): Promise<DesktopProductsResult<T>> { return execute(operation); }
}

async function execute<T>(operation: () => Promise<T>): Promise<DesktopProductsResult<T>> {
  try { return { ok: true, value: await operation() }; }
  catch (cause: unknown) {
    const failure = findNativeFailure(cause);
    return { ok: false, error: { code: failure?.code ?? "PRODUCT_REPOSITORY_UNAVAILABLE", message: failure?.message ?? (cause instanceof Error ? cause.message : "No se pudo acceder a Productos."), requestId: failure?.requestId ?? crypto.randomUUID() } };
  }
}

function segment(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("El contexto de Productos no es válido."); return value; }
function readListQuery(value: unknown): DesktopProductListQuery { return typeof value === "object" && value !== null ? value as DesktopProductListQuery : {}; }
function readMovementQuery(value: unknown): DesktopProductMovementQuery { return typeof value === "object" && value !== null ? value as DesktopProductMovementQuery : {}; }
function readCategoryOverviewQuery(value:unknown):DesktopProductCategoryOverviewQuery{return typeof value==="object"&&value!==null?value as DesktopProductCategoryOverviewQuery:{};}
function findNativeFailure(cause: unknown): KontaveRemoteFailure | null { let current = cause;const visited = new Set<unknown>();while (current instanceof Error && !visited.has(current)) { if (current instanceof KontaveRemoteFailure) return current;visited.add(current);current = current.cause; }return null; }
