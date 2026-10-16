import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyId } from "@kontave/companies/domain";
import {
  ProductCatalogImportConflictPolicy,
  ProductFailure,
  productCategoryId,
  productId,
  type ProductCatalogImportItemKind,
} from "../../domain";
import type {
  ExecuteProductCatalogImportCommand,
  PreviewProductCatalogImportCommand,
  ProductCatalogImportPreview,
  ProductCatalogImportRepository,
  ProductCatalogImportResult,
} from "../../application";
import { z } from "zod";

const selectionSchema = z.object({
  sourceCategoryIds: z.array(z.string()),
  sourceProductIds: z.array(z.string()),
  conflictPolicy: z.nativeEnum(ProductCatalogImportConflictPolicy),
});
const conflictSchema = z.object({
  itemKind: z.enum(["category", "product"]),
  sourceItemId: z.string(),
  reason: z.enum([
    "source_category_unsupported_master", "source_category_name_ambiguous", "source_product_sku_ambiguous", "source_product_barcode_ambiguous",
    "source_product_name_ambiguous", "source_product_category_not_selected", "source_product_unsupported_master", "destination_product_category_conflict", "destination_category_name_exists",
    "destination_category_name_ambiguous", "destination_product_sku_exists", "destination_product_sku_ambiguous",
    "destination_product_barcode_exists", "destination_product_barcode_ambiguous", "destination_product_name_exists",
    "destination_product_name_ambiguous",
  ]),
  destinationItemId: z.string().nullable(),
});
const previewSchema = z.object({
  sourceCompanyId: z.string(),
  destinationCompanyId: z.string(),
  sourceSnapshotToken: z.string(),
  destinationSnapshotToken: z.string(),
  selection: selectionSchema,
  conflicts: z.array(conflictSchema),
  importableCategoryCount: z.number().int().nonnegative(),
  importableProductCount: z.number().int().nonnegative(),
});
const createdSchema = z.object({ itemKind: z.enum(["category", "product"]), sourceItemId: z.string(), destinationItemId: z.string() });
const resultSchema = z.object({
  sourceCompanyId: z.string(),
  destinationCompanyId: z.string(),
  sourceSnapshotToken: z.string(),
  destinationSnapshotToken: z.string(),
  conflictPolicy: z.nativeEnum(ProductCatalogImportConflictPolicy),
  createdCategories: z.array(createdSchema),
  skippedCategorySourceIds: z.array(z.string()),
  createdProducts: z.array(createdSchema),
  skippedProductSourceIds: z.array(z.string()),
});

/** Server-only configuration for a product catalog import RPC adapter. */
export interface ProductCatalogImportSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Supabase RPC adapter for the atomic ADM-005 product-master import boundary. */
export class SupabaseProductCatalogImportRepository implements ProductCatalogImportRepository {
  /** @param client - Trusted server Supabase client with service-role credentials. */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc ProductCatalogImportRepository.preview} */
  async preview(command: PreviewProductCatalogImportCommand): Promise<ProductCatalogImportPreview> {
    const value = await this.rpc("preview_native_product_catalog_import", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_source_company_id: command.sourceCompanyId,
      p_destination_company_id: command.destinationCompanyId,
      p_selection: command.selection,
    });
    return mapPreview(parse(previewSchema, value));
  }

  /** {@inheritDoc ProductCatalogImportRepository.execute} */
  async execute(command: ExecuteProductCatalogImportCommand): Promise<ProductCatalogImportResult> {
    const value = await this.rpc("execute_native_product_catalog_import", {
      p_actor_user_id: command.actorUserId,
      p_organization_id: command.organizationId,
      p_source_company_id: command.sourceCompanyId,
      p_destination_company_id: command.destinationCompanyId,
      p_selection: command.selection,
      p_expected_source_snapshot_token: command.expectedSourceSnapshotToken,
      p_expected_destination_snapshot_token: command.expectedDestinationSnapshotToken,
      p_idempotency_key: command.idempotencyKey,
    });
    return mapResult(parse(resultSchema, value));
  }

  private async rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      const { data, error } = await this.client.rpc(name, args);
      if (error) throw mapError(error);
      return data;
    } catch (cause: unknown) {
      if (cause instanceof ProductFailure) throw cause;
      throw new ProductFailure("PRODUCT_REPOSITORY_UNAVAILABLE", "Product catalog import repository is unavailable.", { cause });
    }
  }
}

/**
 * Creates a server-side Supabase adapter for product catalog imports.
 * @param configuration - Supabase URL and service-role credential kept outside clients.
 * @returns A stateless product catalog import repository.
 */
export function createSupabaseProductCatalogImportRepository(
  configuration: ProductCatalogImportSupabaseConfiguration,
): SupabaseProductCatalogImportRepository {
  return new SupabaseProductCatalogImportRepository(createClient(
    configuration.url,
    configuration.serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ));
}

function mapPreview(value: z.infer<typeof previewSchema>): ProductCatalogImportPreview {
  return {
    sourceCompanyId: companyId(value.sourceCompanyId),
    destinationCompanyId: companyId(value.destinationCompanyId),
    sourceSnapshotToken: value.sourceSnapshotToken,
    destinationSnapshotToken: value.destinationSnapshotToken,
    selection: {
      sourceCategoryIds: value.selection.sourceCategoryIds.map(productCategoryId),
      sourceProductIds: value.selection.sourceProductIds.map(productId),
      conflictPolicy: value.selection.conflictPolicy,
    },
    conflicts: value.conflicts.map(mapConflict),
    importableCategoryCount: value.importableCategoryCount,
    importableProductCount: value.importableProductCount,
  };
}

function mapResult(value: z.infer<typeof resultSchema>): ProductCatalogImportResult {
  return {
    sourceCompanyId: companyId(value.sourceCompanyId),
    destinationCompanyId: companyId(value.destinationCompanyId),
    sourceSnapshotToken: value.sourceSnapshotToken,
    destinationSnapshotToken: value.destinationSnapshotToken,
    conflictPolicy: value.conflictPolicy,
    createdCategories: value.createdCategories.map((item) => mapCreated(item, "category")),
    skippedCategorySourceIds: value.skippedCategorySourceIds.map(productCategoryId),
    createdProducts: value.createdProducts.map((item) => mapCreated(item, "product")),
    skippedProductSourceIds: value.skippedProductSourceIds.map(productId),
  };
}

function mapConflict(value: z.infer<typeof conflictSchema>) {
  const sourceItemId = value.itemKind === "category" ? productCategoryId(value.sourceItemId) : productId(value.sourceItemId);
  const destinationItemId = value.destinationItemId === null ? null : value.itemKind === "category"
    ? productCategoryId(value.destinationItemId) : productId(value.destinationItemId);
  return { ...value, sourceItemId, destinationItemId };
}

function mapCreated(value: z.infer<typeof createdSchema>, expectedKind: ProductCatalogImportItemKind) {
  if (value.itemKind !== expectedKind) {
    throw new ProductFailure("PRODUCT_REPOSITORY_UNAVAILABLE", "Product catalog import persistence returned a mismatched item type.");
  }
  const sourceItemId = expectedKind === "category" ? productCategoryId(value.sourceItemId) : productId(value.sourceItemId);
  const destinationItemId = expectedKind === "category" ? productCategoryId(value.destinationItemId) : productId(value.destinationItemId);
  return { itemKind: expectedKind, sourceItemId, destinationItemId };
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ProductFailure("PRODUCT_REPOSITORY_UNAVAILABLE", "Product catalog import persistence returned invalid data.", { cause: result.error });
  }
  return result.data;
}

function mapError(error: { message: string }): ProductFailure {
  if (error.message.includes("ORGANIZATIONAL_USER_ACCESS_DENIED")) {
    return new ProductFailure("PRODUCT_ACCESS_DENIED", error.message, { cause: error });
  }
  if (error.message.includes("ORGANIZATIONAL_USER_COMPANY_INVALID")) {
    return new ProductFailure("PRODUCT_OUTSIDE_COMPANY", error.message, { cause: error });
  }
  const codes = [
    "PRODUCT_CATALOG_IMPORT_SOURCE_VERSION_CONFLICT", "PRODUCT_CATALOG_IMPORT_DESTINATION_VERSION_CONFLICT",
    "PRODUCT_CATALOG_IMPORT_IDEMPOTENCY_CONFLICT", "PRODUCT_CATALOG_IMPORT_CONFLICT",
    "PRODUCT_CATALOG_IMPORT_INVALID", "PRODUCT_ACCESS_DENIED", "PRODUCT_OUTSIDE_COMPANY",
  ] as const;
  const code = codes.find((candidate) => error.message.includes(candidate));
  return new ProductFailure(code ?? "PRODUCT_REPOSITORY_UNAVAILABLE", code ? error.message : "Product catalog import repository is unavailable.", { cause: error });
}
