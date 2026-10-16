import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import type {
  CreateProductCategoryCommand, CreateProductCommand, ProductCatalogContext, ProductCategoryListQuery,
  ProductCategoryOverviewPage, ProductCategoryOverviewQuery, ProductCategoryOverviewItem,
  ProductCursorPage, ProductDetail, ProductListQuery, ProductMovementPage, ProductMovementQuery,
  ProductsRepository, ProductVersionCommand, ProductCustomFieldsRepository, ProductCustomFieldCatalog,
  ProductCustomFieldSnapshot, ProductCustomFieldsContext, UpdateProductCategoryCommand, UpdateProductCommand,
  ProductCategoryVersionCommand,
  ProductCategoryAliasRepository, CreateProductCategoryAliasCommand, ProductCategoryAliasVersionCommand,
  ResolveProductCategoryAliasCommand, ProductCategoryAliasMatch,
} from "../../application";
import {
  barcode, Product, ProductCategory, ProductCategoryStatus, ProductFailure, productCategoryId, productId,
  ProductStatus, rehydrateSku, UnitOfMeasure, validateProductCustomFieldDefinitions, ProductCategoryAlias,
} from "../../domain";
import { z } from "zod";
export { AuthorizedProductCustomFieldsAccess, type ProductCustomFieldsAuthorizationMetadata } from "./product-custom-fields-access";
export {
  createSupabaseProductCatalogImportRepository,
  SupabaseProductCatalogImportRepository,
  type ProductCatalogImportSupabaseConfiguration,
} from "./product-catalog-import";

const unit=z.nativeEnum(UnitOfMeasure);const status=z.nativeEnum(ProductStatus);const categoryStatus=z.nativeEnum(ProductCategoryStatus);
const categorySchema=z.object({id:z.string(),companyId:z.string(),legacyCategoryId:z.string().nullable(),name:z.string(),description:z.string().nullable(),status:categoryStatus,version:z.number().int().positive()});
const categoryAliasSchema=z.object({id:z.string().uuid(),companyId:z.string(),categoryId:z.string(),alias:z.string(),status:z.enum(["active","retired"]),version:z.number().int().positive()});
const categoryAliasMatchSchema=z.object({categoryId:z.string(),categoryName:z.string(),matchedAs:z.enum(["canonical","alias"])});
const categoryOverviewItemSchema=z.object({category:categorySchema,productCount:z.number().int().nonnegative(),createdAt:z.string().nullable(),updatedAt:z.string().nullable()});
const categoryOverviewSchema=z.object({items:z.array(categoryOverviewItemSchema),nextCursor:z.string().nullable(),total:z.number().int().nonnegative(),summary:z.object({active:z.number().int().nonnegative(),inactive:z.number().int().nonnegative(),inUse:z.number().int().nonnegative(),unused:z.number().int().nonnegative(),unassignedProducts:z.number().int().nonnegative()})});
const inventorySchema=z.object({onHand:z.object({quantity:z.string(),unit}),replenishment:z.object({minimumQuantity:z.string().nullable(),state:z.enum(["available","low","out"]),version:z.number().int().positive(),updatedAt:z.string()}),valuation:z.object({unitCost:z.string(),totalValue:z.string(),currency:z.literal("VES")})});
const productSchema=z.object({id:z.string(),companyId:z.string(),legacyProductId:z.string().nullable(),sku:z.string(),barcodes:z.array(z.string()),name:z.string(),description:z.string().nullable(),category:categorySchema.nullable(),baseUnit:unit,status,version:z.number().int().positive(),inventory:inventorySchema.nullable(),updatedAt:z.string(),capabilities:z.object({inventoryEnabled:z.boolean(),locationTracking:z.boolean(),lotTracking:z.boolean()})});
const pageSchema=z.object({items:z.array(productSchema),nextCursor:z.string().nullable(),total:z.number().int().nonnegative(),summary:z.object({active:z.number().int().nonnegative(),inactive:z.number().int().nonnegative(),lowStock:z.number().int().nonnegative(),outOfStock:z.number().int().nonnegative(),inventoryValue:z.object({amount:z.string(),currency:z.literal("VES")})})});
const movementPageSchema=z.object({items:z.array(z.object({id:z.string(),effectiveDate:z.string(),type:z.string(),quantity:z.object({value:z.string(),unit}),unitCost:z.object({amount:z.string(),currency:z.literal("VES")}),totalCost:z.object({amount:z.string(),currency:z.literal("VES")}),balanceQuantity:z.string(),reference:z.string().nullable(),notes:z.string().nullable(),createdAt:z.string()})),nextCursor:z.string().nullable()});
const customFieldDefinitionSchema=z.discriminatedUnion("type",[
  z.object({id:z.string(),label:z.string(),type:z.literal("text"),required:z.boolean(),maxLength:z.number().int()}),
  z.object({id:z.string(),label:z.string(),type:z.literal("number"),required:z.boolean(),minimum:z.number().nullable(),maximum:z.number().nullable()}),
  z.object({id:z.string(),label:z.string(),type:z.literal("boolean"),required:z.boolean()}),
  z.object({id:z.string(),label:z.string(),type:z.literal("date"),required:z.boolean()}),
  z.object({id:z.string(),label:z.string(),type:z.literal("select"),required:z.boolean(),options:z.array(z.string())}),
]);
const customFieldValuesSchema=z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()]));
const customFieldCatalogSchema=z.object({definitions:z.array(customFieldDefinitionSchema),version:z.number().int().nonnegative(),updatedAt:z.string().nullable()});
const customFieldSnapshotSchema=z.object({values:customFieldValuesSchema,version:z.number().int().nonnegative()});

export class SupabaseProductsRepository implements ProductsRepository, ProductCustomFieldsRepository, ProductCategoryAliasRepository {
  constructor(private readonly client:SupabaseClient){}
  async list(query:ProductListQuery):Promise<ProductCursorPage>{const data=await this.rpc("list_native_products",{...context(query),p_search:query.search,p_status:query.status,p_category_id:query.categoryId,p_stock:query.stock,p_sort:query.sort,p_direction:query.direction,p_cursor:query.cursor,p_limit:query.limit});const parsed=parse(pageSchema,data);return{...parsed,items:parsed.items.map(mapDetail)};}
  async get(input:ProductCatalogContext,id:ReturnType<typeof productId>):Promise<ProductDetail|null>{const data=await this.rpc("get_native_product",{...context(input),p_product_id:id});if(data===null)return null;return mapDetail(parse(productSchema,data));}
  async create(command:CreateProductCommand):Promise<ProductDetail>{return mapDetail(parse(productSchema,await this.rpc("create_native_product",{...context(command),p_sku:command.sku,p_barcodes:command.barcodes,p_name:command.name,p_description:command.description,p_category_id:command.categoryId,p_base_unit:command.baseUnit})));}
  async update(command:UpdateProductCommand):Promise<ProductDetail>{const changes:Record<string,unknown>={};if(command.sku!==undefined)changes.sku=command.sku;if(command.barcodes!==undefined)changes.barcodes=command.barcodes;if(command.name!==undefined)changes.name=command.name;if(command.description!==undefined)changes.description=command.description;if(command.categoryId!==undefined)changes.categoryId=command.categoryId;if(command.baseUnit!==undefined)changes.baseUnit=command.baseUnit;return mapDetail(parse(productSchema,await this.rpc("update_native_product",{...context(command),p_product_id:command.productId,p_expected_version:command.expectedVersion,p_changes:changes})));}
  async setStatus(command:ProductVersionCommand,target:ProductStatus):Promise<ProductDetail>{return mapDetail(parse(productSchema,await this.rpc("set_native_product_status",{...context(command),p_product_id:command.productId,p_expected_version:command.expectedVersion,p_status:target})));}
  async listMovements(query:ProductMovementQuery):Promise<ProductMovementPage>{return parse(movementPageSchema,await this.rpc("list_native_product_movements",{...context(query),p_product_id:query.productId,p_from:query.from,p_to:query.to,p_type:query.type,p_location_id:query.locationId,p_cursor:query.cursor,p_limit:query.limit}));}
  async listCategories(query:ProductCategoryListQuery):Promise<readonly ProductCategory[]>{return parse(z.array(categorySchema),await this.rpc("list_native_product_categories",{...context(query),p_status:query.status})).map(mapCategory);}
  async getCategory(input:ProductCatalogContext,id:ReturnType<typeof productCategoryId>):Promise<ProductCategoryOverviewItem|null>{const data=await this.rpc("get_native_product_category",{...context(input),p_category_id:id});return data===null?null:mapCategoryOverviewItem(parse(categoryOverviewItemSchema,data));}
  async overviewCategories(query:ProductCategoryOverviewQuery):Promise<ProductCategoryOverviewPage>{const value=parse(categoryOverviewSchema,await this.rpc("list_native_product_category_overview",{...context(query),p_search:query.search,p_status:query.status,p_sort:query.sort,p_direction:query.direction,p_cursor:query.cursor,p_limit:query.limit}));return{...value,items:value.items.map(mapCategoryOverviewItem)};}
  async createCategory(command:CreateProductCategoryCommand):Promise<ProductCategory>{return mapCategory(parse(categorySchema,await this.rpc("save_native_product_category",{...context(command),p_category_id:null,p_expected_version:null,p_name:command.name,p_description:command.description})));}
  async updateCategory(command:UpdateProductCategoryCommand):Promise<ProductCategory>{const current=(await this.listCategories({...command,status:"all"})).find(value=>value.id===command.categoryId);if(!current)throw new ProductFailure("PRODUCT_CATEGORY_NOT_FOUND","Product category was not found.");return mapCategory(parse(categorySchema,await this.rpc("save_native_product_category",{...context(command),p_category_id:command.categoryId,p_expected_version:command.expectedVersion,p_name:command.name??current.name,p_description:command.description===undefined?current.description:command.description})));}
  async setCategoryStatus(command:ProductCategoryVersionCommand,target:ProductCategoryStatus):Promise<ProductCategory>{return mapCategory(parse(categorySchema,await this.rpc("set_native_product_category_status",{...context(command),p_category_id:command.categoryId,p_expected_version:command.expectedVersion,p_status:target})));}
  /** {@inheritDoc ProductCategoryAliasRepository.listAliases} */
  async listAliases(input:ProductCatalogContext,categoryId:ReturnType<typeof productCategoryId>):Promise<readonly ProductCategoryAlias[]>{return parse(z.array(categoryAliasSchema),await this.rpc("list_native_product_category_aliases",{...context(input),p_category_id:categoryId})).map(mapCategoryAlias);}
  /** {@inheritDoc ProductCategoryAliasRepository.createAlias} */
  async createAlias(command:CreateProductCategoryAliasCommand):Promise<ProductCategoryAlias>{return mapCategoryAlias(parse(categoryAliasSchema,await this.rpc("create_native_product_category_alias",{...context(command),p_category_id:command.categoryId,p_alias:command.alias})));}
  /** {@inheritDoc ProductCategoryAliasRepository.retireAlias} */
  async retireAlias(command:ProductCategoryAliasVersionCommand):Promise<ProductCategoryAlias>{return mapCategoryAlias(parse(categoryAliasSchema,await this.rpc("retire_native_product_category_alias",{...context(command),p_alias_id:command.aliasId,p_expected_version:command.expectedVersion})));}
  /** {@inheritDoc ProductCategoryAliasRepository.resolveAlias} */
  async resolveAlias(command:ResolveProductCategoryAliasCommand):Promise<ProductCategoryAliasMatch|null>{const value=await this.rpc("resolve_native_product_category_alias",{...context(command),p_source_name:command.sourceName});if(value===null)return null;const match=parse(categoryAliasMatchSchema,value);return{...match,categoryId:productCategoryId(match.categoryId)};}
  /** @inheritdoc */
  async findCatalog(input:ProductCustomFieldsContext):Promise<ProductCustomFieldCatalog|null>{const value=parse(customFieldCatalogSchema,await this.rpc("get_native_product_custom_field_catalog",customFieldsContext(input)));return{...value,definitions:validateProductCustomFieldDefinitions(value.definitions)};}
  /** @inheritdoc */
  async saveCatalog(input:ProductCustomFieldsContext & {readonly definitions:ProductCustomFieldCatalog["definitions"];readonly expectedVersion:number}):Promise<ProductCustomFieldCatalog>{const value=parse(customFieldCatalogSchema,await this.rpc("replace_native_product_custom_field_catalog",{...customFieldsContext(input),p_expected_version:input.expectedVersion,p_definitions:validateProductCustomFieldDefinitions(input.definitions)}));return{...value,definitions:validateProductCustomFieldDefinitions(value.definitions)};}
  /** @inheritdoc */
  async findValues(input:ProductCustomFieldsContext,id:ReturnType<typeof productId>):Promise<ProductCustomFieldSnapshot|null>{return parse(customFieldSnapshotSchema,await this.rpc("get_native_product_custom_field_values",{...customFieldsContext(input),p_product_id:id}));}
  /** @inheritdoc */
  async findValuesByProductIds(input:ProductCustomFieldsContext,ids:readonly ReturnType<typeof productId>[]):Promise<Readonly<Record<string,ProductCustomFieldSnapshot>>>{const rows=parse(z.record(z.string(),customFieldSnapshotSchema),await this.rpc("get_native_product_custom_field_values_batch",{...customFieldsContext(input),p_product_ids:ids}));return Object.freeze(rows);}
  /** @inheritdoc */
  async saveValues(input:ProductCustomFieldsContext & {readonly productId:ReturnType<typeof productId>;readonly values:ProductCustomFieldSnapshot["values"];readonly expectedVersion:number}):Promise<ProductCustomFieldSnapshot>{return parse(customFieldSnapshotSchema,await this.rpc("replace_native_product_custom_field_values",{...customFieldsContext(input),p_product_id:input.productId,p_expected_version:input.expectedVersion,p_values:input.values}));}
  private async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await this.client.rpc(name, args);
      if (error) throw mapError(error);
      return data;
    } catch (cause: unknown) {
      if (cause instanceof ProductFailure) throw cause;
      throw new ProductFailure(
        "PRODUCT_REPOSITORY_UNAVAILABLE",
        "Product repository is unavailable.",
        { cause },
      );
    }
  }
}
/** Credentials required by the server-side products adapter. */
export interface ProductsSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}
/**
 * Creates a stateless Supabase products repository.
 * @param configuration - Supabase endpoint and service-role credential.
 * @returns A configured products repository.
 */
export function createSupabaseProductsRepository(
  configuration: ProductsSupabaseConfiguration,
): SupabaseProductsRepository {
  return new SupabaseProductsRepository(createClient(
    configuration.url,
    configuration.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ));
}
function context(value:ProductCatalogContext){return{p_actor_user_id:value.actorUserId,p_organization_id:value.organizationId,p_company_id:value.companyId};}
function customFieldsContext(value:ProductCustomFieldsContext){return context(value);}
function mapCategory(value:z.infer<typeof categorySchema>){return new ProductCategory({...value,id:productCategoryId(value.id),companyId:companyId(value.companyId)});}
function mapCategoryOverviewItem(value:z.infer<typeof categoryOverviewItemSchema>):ProductCategoryOverviewItem{return{category:mapCategory(value.category),productCount:value.productCount,createdAt:value.createdAt,updatedAt:value.updatedAt};}
function mapDetail(value:z.infer<typeof productSchema>):ProductDetail{return{product:new Product({id:productId(value.id),companyId:companyId(value.companyId),legacyProductId:value.legacyProductId,sku:rehydrateSku(value.sku,value.legacyProductId),barcodes:value.barcodes.map(barcode),name:value.name,description:value.description,categoryId:value.category?productCategoryId(value.category.id):null,baseUnit:value.baseUnit,status:value.status,version:value.version}),category:value.category?mapCategory(value.category):null,inventory:value.inventory,updatedAt:value.updatedAt,capabilities:value.capabilities};}
function parse<T extends z.ZodType>(schema:T,value:unknown):z.infer<T>{const result=schema.safeParse(value);if(!result.success)throw new ProductFailure("PRODUCT_REPOSITORY_UNAVAILABLE","Product persistence returned invalid data.",{cause:result.error});return result.data;}
function mapCategoryAlias(value:z.infer<typeof categoryAliasSchema>):ProductCategoryAlias{return new ProductCategoryAlias({...value,companyId:companyId(value.companyId),categoryId:productCategoryId(value.categoryId)});}
function mapError(error:{message:string}):ProductFailure{const codes=["PRODUCT_CUSTOM_FIELD_CATALOG_VERSION_CONFLICT","PRODUCT_CUSTOM_FIELDS_VERSION_CONFLICT","PRODUCT_CUSTOM_FIELDS_INVALID","PRODUCT_CATEGORY_ALIAS_VERSION_CONFLICT","PRODUCT_CATEGORY_ALIAS_NOT_FOUND","PRODUCT_CATEGORY_ALIAS_CONFLICT","PRODUCT_DUPLICATE_CATEGORY_ALIAS","PRODUCT_CATEGORY_ALIAS_INVALID","PRODUCT_CATEGORY_VERSION_CONFLICT","PRODUCT_LOCATION_TRACKING_UNAVAILABLE","PRODUCT_DUPLICATE_BARCODE","PRODUCT_DUPLICATE_CATEGORY","PRODUCT_DUPLICATE_SKU","PRODUCT_VERSION_CONFLICT","PRODUCT_CATEGORY_NOT_FOUND","PRODUCT_NOT_FOUND","PRODUCT_OUTSIDE_COMPANY","PRODUCT_ACCESS_DENIED","PRODUCT_TRANSITION_INVALID","PRODUCT_CATEGORY_INVALID","PRODUCT_INVALID"]as const;const code=codes.find(value=>error.message.includes(value));return new ProductFailure(code??"PRODUCT_REPOSITORY_UNAVAILABLE",code?error.message:"Product repository is unavailable.",{cause:error});}
