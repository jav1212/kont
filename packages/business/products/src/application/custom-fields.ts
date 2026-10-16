import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  ProductFailure,
  productId,
  validateProductCustomFieldDefinitions,
  validateProductCustomFieldValues,
  type ProductCustomFieldDefinition,
  type ProductCustomFieldValues,
} from "../domain";
import type { ProductId } from "../domain/identifiers";

/** Actor and tenant scope required for custom product data operations. */
export interface ProductCustomFieldsContext {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

/** Versioned company catalog of additional product fields. */
export interface ProductCustomFieldCatalog {
  readonly definitions: readonly ProductCustomFieldDefinition[];
  readonly version: number;
  readonly updatedAt: string | null;
}

/** Persisted additional values and product revision for one product. */
export interface ProductCustomFieldSnapshot {
  readonly values: ProductCustomFieldValues;
  readonly version: number;
}

/** Persistence port for company field definitions and product custom values. */
export interface ProductCustomFieldsRepository {
  /**
   * Loads the company's definitions without returning products from another company.
   * @param context - Actor, organization and company scope.
   * @returns The versioned catalog or `null` when no custom fields are registered.
   * @throws {ProductFailure} When persistence is unavailable.
   */
  findCatalog(context: ProductCustomFieldsContext): Promise<ProductCustomFieldCatalog | null>;
  /**
   * Saves company definitions using optimistic concurrency.
   * @param input - Scoped definitions and previously observed catalog version.
   * @returns The authoritative versioned catalog.
   * @throws {ProductFailure} When persistence fails or the catalog revision is stale.
   */
  saveCatalog(input: ProductCustomFieldsContext & {
    readonly definitions: readonly ProductCustomFieldDefinition[];
    readonly expectedVersion: number;
  }): Promise<ProductCustomFieldCatalog>;
  /**
   * Loads additional values only for a product within the requested company.
   * @param context - Actor, organization and company scope.
   * @param productId - Product whose extra values are requested.
   * @returns The versioned values or `null` when the product does not exist in scope.
   * @throws {ProductFailure} When persistence is unavailable.
   */
  findValues(context: ProductCustomFieldsContext, productId: ProductId): Promise<ProductCustomFieldSnapshot | null>;
  /**
   * Loads values for a bounded set of products in one company-scoped read.
   * @param context - Actor, organization and company scope.
   * @param productIds - Product identifiers from the currently visible page.
   * @returns Snapshots keyed by product identifier; products without values are omitted.
   * @throws {ProductFailure} When persistence is unavailable.
   */
  findValuesByProductIds(context: ProductCustomFieldsContext, productIds: readonly ProductId[]): Promise<Readonly<Record<string, ProductCustomFieldSnapshot>>>;
  /**
   * Replaces product values using a dedicated custom-data revision.
   * @param input - Scoped product, fully validated values and expected custom-data revision.
   * @returns Authoritative custom values and new custom-data revision.
   * @throws {ProductFailure} When the product is absent, persistence fails, or its revision is stale.
   */
  saveValues(input: ProductCustomFieldsContext & {
    readonly productId: ProductId;
    readonly values: ProductCustomFieldValues;
    readonly expectedVersion: number;
  }): Promise<ProductCustomFieldSnapshot>;
}

/** Reads typed product values for one visible list page. */
export class GetProductCustomFieldValuesByProductIds {
  /**
   * @param repository - Company-scoped field catalog and values persistence.
   * @param access - Product data read authorization policy.
   * @returns A bounded batch query.
   * @throws {ProductFailure} When the query dependencies are not supplied.
   */
  constructor(
    private readonly repository: ProductCustomFieldsRepository,
    private readonly access: Pick<ProductCustomFieldsAccess, "assertCanReadValues">,
  ) {}

  /**
   * Resolves typed values for at most 50 products against the current catalog.
   * @param context - Actor and company scope.
   * @param rawProductIds - IDs shown in the requested page.
   * @returns Validated snapshots keyed by product ID.
   * @throws {ProductFailure} When access is denied, the request is too large, or stored values are invalid.
   */
  async execute(context: ProductCustomFieldsContext, rawProductIds: readonly string[]): Promise<Readonly<Record<string, ProductCustomFieldSnapshot>>> {
    await accessCall(() => this.access.assertCanReadValues(context));
    if (!Array.isArray(rawProductIds) || rawProductIds.length > 50 || new Set(rawProductIds).size !== rawProductIds.length) {
      throw new ProductFailure("PRODUCT_CUSTOM_FIELDS_INVALID", "The product custom-field batch is invalid.");
    }
    const ids = rawProductIds.map((value) => productId(value));
    const [catalog, snapshots] = await repositoryCall(async () => Promise.all([
      this.repository.findCatalog(context),
      this.repository.findValuesByProductIds(context, ids),
    ]));
    const definitions = validateProductCustomFieldDefinitions(catalog?.definitions ?? []);
    return Object.freeze(Object.fromEntries(Object.entries(snapshots).map(([id, snapshot]) => [id, {
      ...snapshot,
      values: validateProductCustomFieldValues(definitions, snapshot.values),
    }])));
  }
}

/** Authorization boundary for custom-field administration and value updates. */
export interface ProductCustomFieldsAccess {
  /**
   * Checks whether the actor may read company field definitions.
   * @param context - Actor and tenant scope to authorize.
   * @returns A promise resolved after authorization succeeds.
   * @throws {ProductFailure} When the actor may not read the field catalog.
   */
  assertCanReadCatalog(context: ProductCustomFieldsContext): Promise<void>;
  /**
   * Checks whether the actor may define additional fields for a company.
   * @param context - Actor and tenant scope to authorize.
   * @returns A promise resolved after authorization succeeds.
   * @throws {ProductFailure} When the actor may not manage the field catalog.
   */
  assertCanManageCatalog(context: ProductCustomFieldsContext): Promise<void>;
  /**
   * Checks whether the actor may read additional product values.
   * @param context - Actor and tenant scope to authorize.
   * @returns A promise resolved after authorization succeeds.
   * @throws {ProductFailure} When the actor may not read product data.
   */
  assertCanReadValues(context: ProductCustomFieldsContext): Promise<void>;
  /**
   * Checks whether the actor may write additional product values.
   * @param context - Actor and tenant scope to authorize.
   * @returns A promise resolved after authorization succeeds.
   * @throws {ProductFailure} When the actor may not edit product data.
   */
  assertCanUpdateValues(context: ProductCustomFieldsContext): Promise<void>;
}

/** Reads one company's product field catalog without persisting defaults. */
export class GetProductCustomFieldCatalog {
  /**
   * @param repository - Company-scoped field catalog persistence.
   * @param access - Catalog read authorization policy.
   * @returns A query for a company's current definitions.
   * @throws {ProductFailure} When the query dependencies are not supplied.
   */
  constructor(
    private readonly repository: ProductCustomFieldsRepository,
    private readonly access: Pick<ProductCustomFieldsAccess, "assertCanReadCatalog">,
  ) {}

  /**
   * Resolves a company's registered additional fields.
   * @param context - Actor and company scope.
   * @returns The stored catalog or an empty version-zero catalog.
   * @throws {ProductFailure} When access is denied or persistence fails.
   */
  async execute(context: ProductCustomFieldsContext): Promise<ProductCustomFieldCatalog> {
    await accessCall(() => this.access.assertCanReadCatalog(context));
    const stored = await repositoryCall(() => this.repository.findCatalog(context));
    if (!stored) return { definitions: Object.freeze([]), version: 0, updatedAt: null };
    return { ...stored, definitions: validateProductCustomFieldDefinitions(stored.definitions) };
  }
}

/** Replaces company product field definitions with compare-and-swap control. */
export class ReplaceProductCustomFieldCatalog {
  /**
   * @param repository - Company-scoped field catalog persistence.
   * @param access - Catalog management authorization policy.
   * @returns A command for replacing typed definitions.
   * @throws {ProductFailure} When the command dependencies are not supplied.
   */
  constructor(
    private readonly repository: ProductCustomFieldsRepository,
    private readonly access: Pick<ProductCustomFieldsAccess, "assertCanManageCatalog">,
  ) {}

  /**
   * Saves a validated set of company product-field definitions.
   * @param command - Actor, company, expected catalog revision and definitions.
   * @returns The authoritative catalog after replacement.
   * @throws {ProductFailure} When authorization, validation, concurrency, or persistence fails.
   */
  async execute(command: ProductCustomFieldsContext & {
    readonly definitions: readonly ProductCustomFieldDefinition[];
    readonly expectedVersion: number;
  }): Promise<ProductCustomFieldCatalog> {
    await accessCall(() => this.access.assertCanManageCatalog(command));
    const definitions = validateProductCustomFieldDefinitions(command.definitions);
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) {
      throw new ProductFailure("PRODUCT_CUSTOM_FIELD_CATALOG_VERSION_CONFLICT", "The product custom-field catalog revision is invalid.");
    }
    return repositoryCall(() => this.repository.saveCatalog({ ...command, definitions }));
  }
}

/** Reads validated additional values for one product. */
export class GetProductCustomFieldValues {
  /**
   * @param repository - Company-scoped field definitions and product values.
   * @param access - Product data read authorization policy.
   * @returns A query for a product's typed additional values.
   * @throws {ProductFailure} When the query dependencies are not supplied.
   */
  constructor(
    private readonly repository: ProductCustomFieldsRepository,
    private readonly access: Pick<ProductCustomFieldsAccess, "assertCanReadValues">,
  ) {}

  /**
   * Resolves the product's values using its current company catalog.
   * @param context - Actor and company scope.
   * @param productId - Product whose additional data is requested.
   * @returns Validated values and the current product revision.
   * @throws {ProductFailure} When access is denied, the product is absent, or stored data is invalid.
   */
  async execute(context: ProductCustomFieldsContext, productId: ProductId): Promise<ProductCustomFieldSnapshot> {
    await accessCall(() => this.access.assertCanReadValues(context));
    const [catalog, stored] = await repositoryCall(async () => Promise.all([
      this.repository.findCatalog(context),
      this.repository.findValues(context, productId),
    ]));
    if (!stored) throw new ProductFailure("PRODUCT_NOT_FOUND", "Product was not found.");
    const definitions = validateProductCustomFieldDefinitions(catalog?.definitions ?? []);
    return { ...stored, values: validateProductCustomFieldValues(definitions, stored.values) };
  }
}

/** Updates validated additional product values with optimistic product revision. */
export class UpdateProductCustomFieldValues {
  /**
   * @param repository - Company-scoped field definitions and product values.
   * @param access - Product data update authorization policy.
   * @returns A command for replacing typed custom values.
   * @throws {ProductFailure} When the command dependencies are not supplied.
   */
  constructor(
    private readonly repository: ProductCustomFieldsRepository,
    private readonly access: Pick<ProductCustomFieldsAccess, "assertCanUpdateValues">,
  ) {}

  /**
   * Validates and replaces extra values against the registered company catalog.
   * @param command - Actor scope, product, value map and expected custom-data revision.
   * @returns Authoritative values and updated custom-data revision.
   * @throws {ProductFailure} When access, catalog validation, concurrency, or persistence fails.
   */
  async execute(command: ProductCustomFieldsContext & {
    readonly productId: ProductId;
    readonly values: Readonly<Record<string, unknown>>;
    readonly expectedVersion: number;
  }): Promise<ProductCustomFieldSnapshot> {
    await accessCall(() => this.access.assertCanUpdateValues(command));
    if (!Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0) {
      throw new ProductFailure("PRODUCT_CUSTOM_FIELDS_VERSION_CONFLICT", "The custom-data revision is invalid.");
    }
    const catalog = await repositoryCall(() => this.repository.findCatalog(command));
    const definitions = validateProductCustomFieldDefinitions(catalog?.definitions ?? []);
    const values = validateProductCustomFieldValues(definitions, command.values);
    return repositoryCall(() => this.repository.saveValues({ ...command, values }));
  }
}

async function accessCall(operation: () => Promise<void>): Promise<void> {
  try { await operation(); }
  catch (cause: unknown) {
    if (cause instanceof ProductFailure) throw cause;
    throw new ProductFailure("PRODUCT_ACCESS_DENIED", "Product custom-field access was denied.", { cause });
  }
}

async function repositoryCall<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (cause: unknown) {
    if (cause instanceof ProductFailure) throw cause;
    throw new ProductFailure("PRODUCT_REPOSITORY_UNAVAILABLE", "Product custom fields are unavailable.", { cause });
  }
}
