import { NativeApiClient, NativeApiFailure } from "@kontave/native-api-client";
import type {
  NativeCreateProductCategoryDto, NativeCreateProductDto, NativeProductCategoryDto, NativeProductCategoryOverviewDto, NativeProductCategoryOverviewItemDto, NativeProductDetailDto,
  NativeOrganizationDto, NativeProductDto, NativeProductListDto, NativeProductMovementPageDto, NativeProductReplenishmentPolicyDto, NativeProductSalePricingDto, NativeProductTaxationDto, NativeProductUnitEconomicsDto,
  NativeUpdateProductCategoryDto, NativeUpdateProductDto, NativeUpdateProductInventoryProfileDto, NativeUpdateProductSalePricingDto, NativeUpdateProductTaxationDto,
} from "@kontave/native-api-contracts";
import type { DesktopAuthenticatedRequest } from "../auth/desktop-authenticated-request.js";
import type { DesktopProductCategoryOverviewQuery, DesktopProductInsightsQuery, DesktopProductListQuery, DesktopProductMovementQuery, DesktopProductsResult } from "../../shared/desktop-api.js";

export class DesktopProductsController {
  private readonly client: NativeApiClient;

  constructor(baseUrl: string, authenticatedRequest: DesktopAuthenticatedRequest) {
    this.client = new NativeApiClient({ baseUrl, client: "desktop", authenticatedFetch: (input, init) => authenticatedRequest.fetch(input, init) });
  }

  list(organizationId: unknown, companyId: unknown, query: unknown): Promise<DesktopProductsResult<NativeProductListDto>> {
    return this.read(() => this.client.get(`${root(organizationId, companyId)}/products${queryString(readListQuery(query))}`));
  }

  permissions(organizationId: unknown): Promise<DesktopProductsResult<readonly string[]>> {
    return this.read(async () => (await this.client.get<NativeOrganizationDto>(`/api/native/v1/organizations/${segment(organizationId)}`)).permissions);
  }

  get(organizationId: unknown, companyId: unknown, productId: unknown): Promise<DesktopProductsResult<NativeProductDetailDto>> {
    return this.read(() => this.client.get(`${root(organizationId, companyId)}/products/${segment(productId)}`));
  }

  create(organizationId: unknown, companyId: unknown, command: NativeCreateProductDto): Promise<DesktopProductsResult<NativeProductDto>> {
    return this.write(() => this.client.request(`${root(organizationId, companyId)}/products`, json("POST", command)));
  }

  update(organizationId: unknown, companyId: unknown, productId: unknown, command: NativeUpdateProductDto): Promise<DesktopProductsResult<NativeProductDto>> {
    return this.write(() => this.client.request(`${root(organizationId, companyId)}/products/${segment(productId)}`, json("PATCH", command)));
  }

  setStatus(organizationId: unknown, companyId: unknown, productId: unknown, active: boolean, expectedVersion: number): Promise<DesktopProductsResult<NativeProductDto>> {
    return this.write(() => this.client.request(`${root(organizationId, companyId)}/products/${segment(productId)}/${active ? "activate" : "deactivate"}`, json("POST", { expectedVersion })));
  }

  movements(organizationId: unknown, companyId: unknown, productId: unknown, query: unknown): Promise<DesktopProductsResult<NativeProductMovementPageDto>> {
    return this.read(() => this.client.get(`${root(organizationId, companyId)}/products/${segment(productId)}/movements${queryString(readMovementQuery(query))}`));
  }

  updateInventoryProfile(organizationId: unknown, companyId: unknown, productId: unknown, command: NativeUpdateProductInventoryProfileDto): Promise<DesktopProductsResult<NativeProductReplenishmentPolicyDto>> {
    return this.write(() => this.client.request(`${root(organizationId, companyId)}/products/${segment(productId)}/inventory-profile`, json("PATCH", command)));
  }

  categories(organizationId: unknown, companyId: unknown, status: unknown): Promise<DesktopProductsResult<readonly NativeProductCategoryDto[]>> {
    const normalized = status === "inactive" || status === "all" ? status : "active";
    return this.read(() => this.client.get(`${root(organizationId, companyId)}/product-categories?status=${normalized}`));
  }

  categoryOverview(organizationId:unknown,companyId:unknown,query:unknown):Promise<DesktopProductsResult<NativeProductCategoryOverviewDto>>{
    return this.read(()=>this.client.get(`${root(organizationId,companyId)}/product-categories/overview${queryString(readCategoryOverviewQuery(query))}`));
  }

  getCategory(organizationId:unknown,companyId:unknown,categoryId:unknown):Promise<DesktopProductsResult<NativeProductCategoryOverviewItemDto>>{
    return this.read(()=>this.client.get(`${root(organizationId,companyId)}/product-categories/${segment(categoryId)}`));
  }

  unitEconomics(organizationId:unknown,companyId:unknown,productId:unknown,query:DesktopProductInsightsQuery):Promise<DesktopProductsResult<NativeProductUnitEconomicsDto>>{return this.read(()=>this.client.get(`${root(organizationId,companyId)}/products/${segment(productId)}/unit-economics${queryString(query)}`));}
  updateSalePricing(organizationId:unknown,companyId:unknown,productId:unknown,command:NativeUpdateProductSalePricingDto):Promise<DesktopProductsResult<NativeProductSalePricingDto>>{return this.write(()=>this.client.request(`${root(organizationId,companyId)}/products/${segment(productId)}/sale-pricing`,json("PATCH",command)));}
  updateTaxation(organizationId:unknown,companyId:unknown,productId:unknown,command:NativeUpdateProductTaxationDto):Promise<DesktopProductsResult<NativeProductTaxationDto>>{return this.write(()=>this.client.request(`${root(organizationId,companyId)}/products/${segment(productId)}/tax-profile`,json("PATCH",command)));}

  createCategory(organizationId: unknown, companyId: unknown, command: NativeCreateProductCategoryDto): Promise<DesktopProductsResult<NativeProductCategoryDto>> {
    return this.write(() => this.client.request(`${root(organizationId, companyId)}/product-categories`, json("POST", command)));
  }

  updateCategory(organizationId: unknown, companyId: unknown, categoryId: unknown, command: NativeUpdateProductCategoryDto): Promise<DesktopProductsResult<NativeProductCategoryDto>> {
    return this.write(() => this.client.request(`${root(organizationId, companyId)}/product-categories/${segment(categoryId)}`, json("PATCH", command)));
  }

  setCategoryStatus(organizationId: unknown, companyId: unknown, categoryId: unknown, active: boolean, expectedVersion: number): Promise<DesktopProductsResult<NativeProductCategoryDto>> {
    return this.write(() => this.client.request(`${root(organizationId, companyId)}/product-categories/${segment(categoryId)}/${active ? "activate" : "deactivate"}`, json("POST", { expectedVersion })));
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

function root(organizationId: unknown, companyId: unknown): string {
  return `/api/native/v1/organizations/${segment(organizationId)}/companies/${segment(companyId)}`;
}
function segment(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new Error("El contexto de Productos no es válido."); return encodeURIComponent(value); }
function json(method: "POST" | "PATCH", body: unknown): RequestInit { return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) }; }
function queryString(query: object): string { const values = new URLSearchParams();Object.entries(query).forEach(([key, value]) => { if ((typeof value === "string" || typeof value === "number") && value !== "") values.set(key, String(value)); });const encoded = values.toString();return encoded ? `?${encoded}` : ""; }
function readListQuery(value: unknown): DesktopProductListQuery { return typeof value === "object" && value !== null ? value as DesktopProductListQuery : {}; }
function readMovementQuery(value: unknown): DesktopProductMovementQuery { return typeof value === "object" && value !== null ? value as DesktopProductMovementQuery : {}; }
function readCategoryOverviewQuery(value:unknown):DesktopProductCategoryOverviewQuery{return typeof value==="object"&&value!==null?value as DesktopProductCategoryOverviewQuery:{};}
function findNativeFailure(cause: unknown): NativeApiFailure | null { let current = cause;const visited = new Set<unknown>();while (current instanceof Error && !visited.has(current)) { if (current instanceof NativeApiFailure) return current;visited.add(current);current = current.cause; }return null; }
