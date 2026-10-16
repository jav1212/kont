import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import {
  ProductCatalogImportConflictPolicy,
  ProductFailure,
  normalizeProductCatalogImportSelection,
  type ProductCatalogImportConflictReason,
  type ProductCatalogImportItemKind,
  type ProductCatalogImportSelection,
  type ProductCategoryId,
  type ProductId,
} from "../domain";

/** Actor, organization and exact company resource used by a catalog import authorization decision. */
export interface ProductCatalogImportAuthorizationScope {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

/** Import operations authorized independently against the source and destination catalog resources. */
export enum ProductCatalogImportOperation {
  ReadSource = "read_product_catalog_import_source",
  PreviewDestination = "preview_product_catalog_import_destination",
  ImportToDestination = "import_product_catalog_to_destination",
}

/** Authorization boundary for source reads and destination writes during a product catalog import. */
export interface ProductCatalogImportAuthorization {
  /**
   * Decides one resource-scoped import action.
   * @param scope - Authenticated actor, organization and the exact source or destination company.
   * @param operation - Import-specific operation to authorize.
   * @param permission - Existing inventory permission required by the operation.
   * @returns Nothing when the actor is allowed to proceed.
   * @throws {ProductFailure} When access is denied or cannot be evaluated.
   */
  assertCanImportProductCatalog(
    scope: ProductCatalogImportAuthorizationScope,
    operation: ProductCatalogImportOperation,
    permission: "inventory.read" | "inventory.update",
  ): Promise<void>;
}

/** A collision found while comparing one selected source master record with the destination catalog. */
export interface ProductCatalogImportConflict {
  readonly itemKind: ProductCatalogImportItemKind;
  readonly sourceItemId: ProductCategoryId | ProductId;
  readonly reason: ProductCatalogImportConflictReason;
  readonly destinationItemId: ProductCategoryId | ProductId | null;
}

/** Immutable preview generated from exact selected-source and target-conflict snapshot tokens. */
export interface ProductCatalogImportPreview {
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  /** Opaque token for the exact selected source master rows. */
  readonly sourceSnapshotToken: string;
  /** Opaque token for target records relevant to the selected collision keys. */
  readonly destinationSnapshotToken: string;
  readonly selection: ProductCatalogImportSelection;
  readonly conflicts: readonly ProductCatalogImportConflict[];
  readonly importableCategoryCount: number;
  readonly importableProductCount: number;
}

/** Request to inspect source master data and target conflicts without changing either company. */
export interface PreviewProductCatalogImportCommand {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  readonly selection: ProductCatalogImportSelection;
}

/** Request to atomically import a previewed source snapshot into a distinct target company. */
export interface ExecuteProductCatalogImportCommand extends PreviewProductCatalogImportCommand {
  /** Opaque source token returned by the preview for this exact selection. */
  readonly expectedSourceSnapshotToken: string;
  /** Opaque destination token returned by the preview for this exact collision scope. */
  readonly expectedDestinationSnapshotToken: string;
  readonly idempotencyKey: string;
}

/** Source-to-new-target identity pair persisted by a successful catalog import. */
export interface ProductCatalogImportCreatedItem {
  /** The selected source master type represented by this mapping. */
  readonly itemKind: ProductCatalogImportItemKind;
  readonly sourceItemId: ProductCategoryId | ProductId;
  readonly destinationItemId: ProductCategoryId | ProductId;
}

/** Durable receipt for one idempotent catalog import request. */
export interface ProductCatalogImportResult {
  readonly sourceCompanyId: CompanyId;
  readonly destinationCompanyId: CompanyId;
  /** Source token verified before creation; this remains the preview token on an idempotent replay. */
  readonly sourceSnapshotToken: string;
  /** Target token after the transaction, or the original receipt token on an idempotent replay. */
  readonly destinationSnapshotToken: string;
  readonly conflictPolicy: ProductCatalogImportConflictPolicy;
  readonly createdCategories: readonly ProductCatalogImportCreatedItem[];
  readonly skippedCategorySourceIds: readonly ProductCategoryId[];
  readonly createdProducts: readonly ProductCatalogImportCreatedItem[];
  readonly skippedProductSourceIds: readonly ProductId[];
}

/** Atomic persistence boundary for product-master imports between companies in one organization. */
export interface ProductCatalogImportRepository {
  /**
   * Reads selected source master records and destination collisions without mutating either catalog.
   * A selected product whose non-null source category is not also selected must be reported as `source_product_category_not_selected`; a skip policy may skip that product, while a fail policy must reject execution. Implementations must return opaque tokens that cover exactly the selected source rows and target collision-key scope.
   * @param command - Authorized and normalized source/destination selection.
   * @returns The exact source/destination revision pair and all detectable target conflicts.
   * @throws {ProductFailure} When a selected source item is absent, outside scope, or persistence is unavailable.
   */
  preview(command: PreviewProductCatalogImportCommand): Promise<ProductCatalogImportPreview>;
  /**
   * Creates only fresh target categories and products in one transaction.
   * Implementations must lock or otherwise verify both expected snapshot tokens, re-evaluate collisions, preserve the source unchanged, and persist an idempotency receipt bound to the complete intent. The target token must include all rows relevant to selected category names, SKUs, barcodes and names; it must not claim a whole-catalog revision unless every writer maintains it. They must not copy stock, cost, movements, pricing, fiscal/tax data, custom fields, composition, historical IDs, or update existing target items.
   * @param command - Authorized normalized request pinned to previewed catalog revisions.
   * @returns The durable creation/skipping receipt, or the original receipt for an identical retry.
   * @throws {ProductFailure} When revisions are stale, a fail-policy conflict exists, or idempotency is reused for another intent.
   */
  execute(command: ExecuteProductCatalogImportCommand): Promise<ProductCatalogImportResult>;
}

/** Previews the exact conflicts and revision expectations for a non-destructive catalog import. */
export class PreviewProductCatalogImport {
  /**
   * @param authorization - Resource-scoped authorization boundary.
   * @param repository - Non-mutating product catalog import reader.
   */
  constructor(
    private readonly authorization: ProductCatalogImportAuthorization,
    private readonly repository: Pick<ProductCatalogImportRepository, "preview">,
  ) {}

  /**
   * @param command - Source, destination and explicit master-data selection.
   * @returns A stable preview whose opaque snapshot tokens must be supplied to execute.
   * @throws {ProductFailure} When the scope is invalid, unauthorized, or persistence fails.
   */
  async execute(command: PreviewProductCatalogImportCommand): Promise<ProductCatalogImportPreview> {
    const normalized = normalizePreview(command);
    await authorize(this.authorization, normalized, ProductCatalogImportOperation.PreviewDestination);
    return assertPreview(normalized, await repositoryCall(() => this.repository.preview(normalized)));
  }
}

/** Imports selected product masters only after source and destination authorization. */
export class ExecuteProductCatalogImport {
  /**
   * @param authorization - Resource-scoped authorization boundary.
   * @param repository - Atomic, idempotent catalog-import writer.
   */
  constructor(
    private readonly authorization: ProductCatalogImportAuthorization,
    private readonly repository: Pick<ProductCatalogImportRepository, "execute">,
  ) {}

  /**
   * @param command - Preview-pinned source/destination selection and idempotency key.
   * @returns A verified import receipt with fresh target identities only.
   * @throws {ProductFailure} When unauthorized, invalid, stale, conflicting, or persistence fails.
   */
  async execute(command: ExecuteProductCatalogImportCommand): Promise<ProductCatalogImportResult> {
    const normalized = normalizeExecute(command);
    await authorize(this.authorization, normalized, ProductCatalogImportOperation.ImportToDestination);
    return assertResult(normalized, await repositoryCall(() => this.repository.execute(normalized)));
  }
}

function normalizePreview(command: PreviewProductCatalogImportCommand): PreviewProductCatalogImportCommand {
  assertScope(command);
  const selection = normalizeProductCatalogImportSelection(command.selection);
  return Object.freeze({ ...command, selection });
}

function normalizeExecute(command: ExecuteProductCatalogImportCommand): ExecuteProductCatalogImportCommand {
  const preview = normalizePreview(command);
  snapshotToken(command.expectedSourceSnapshotToken, "source");
  snapshotToken(command.expectedDestinationSnapshotToken, "destination");
  const idempotencyKey = command.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) invalid("The catalog import idempotency key is invalid.");
  return Object.freeze({ ...preview, expectedSourceSnapshotToken: command.expectedSourceSnapshotToken.trim(),
    expectedDestinationSnapshotToken: command.expectedDestinationSnapshotToken.trim(), idempotencyKey });
}

async function authorize(
  authorization: ProductCatalogImportAuthorization,
  command: PreviewProductCatalogImportCommand,
  destinationOperation: ProductCatalogImportOperation,
): Promise<void> {
  await authorization.assertCanImportProductCatalog(
    sourceScope(command), ProductCatalogImportOperation.ReadSource, "inventory.read",
  );
  await authorization.assertCanImportProductCatalog(
    destinationScope(command), destinationOperation, "inventory.update",
  );
}

function assertScope(command: PreviewProductCatalogImportCommand): void {
  if (!command.actorUserId || !command.organizationId || !command.sourceCompanyId || !command.destinationCompanyId) {
    invalid("The product catalog import scope is invalid.");
  }
  if (command.sourceCompanyId === command.destinationCompanyId) {
    invalid("The product catalog import source and destination must differ.");
  }
}

function sourceScope(command: PreviewProductCatalogImportCommand): ProductCatalogImportAuthorizationScope {
  return { actorUserId: command.actorUserId, organizationId: command.organizationId, companyId: command.sourceCompanyId };
}

function destinationScope(command: PreviewProductCatalogImportCommand): ProductCatalogImportAuthorizationScope {
  return { actorUserId: command.actorUserId, organizationId: command.organizationId, companyId: command.destinationCompanyId };
}

function assertPreview(command: PreviewProductCatalogImportCommand, preview: ProductCatalogImportPreview): ProductCatalogImportPreview {
  if (preview.sourceCompanyId !== command.sourceCompanyId || preview.destinationCompanyId !== command.destinationCompanyId) {
    invalid("Persistence returned a preview for another company.");
  }
  snapshotToken(preview.sourceSnapshotToken, "source");
  snapshotToken(preview.destinationSnapshotToken, "destination");
  assertSameSelection(command.selection, preview.selection);
  assertCounts(preview.importableCategoryCount, preview.importableProductCount);
  assertConflicts(command.selection, preview.conflicts);
  return freezePreview(preview);
}

function assertResult(command: ExecuteProductCatalogImportCommand, result: ProductCatalogImportResult): ProductCatalogImportResult {
  if (result.sourceCompanyId !== command.sourceCompanyId || result.destinationCompanyId !== command.destinationCompanyId) {
    invalid("Persistence returned an import receipt for another company.");
  }
  if (result.sourceSnapshotToken !== command.expectedSourceSnapshotToken
    || result.conflictPolicy !== command.selection.conflictPolicy) {
    invalid("Persistence returned an import receipt for another source snapshot or policy.");
  }
  snapshotToken(result.destinationSnapshotToken, "destination");
  assertPartition(command.selection.sourceCategoryIds, result.createdCategories, result.skippedCategorySourceIds, "category");
  assertPartition(command.selection.sourceProductIds, result.createdProducts, result.skippedProductSourceIds, "product");
  return freezeResult(result);
}

function assertSameSelection(expected: ProductCatalogImportSelection, actual: ProductCatalogImportSelection): void {
  const normalized = normalizeProductCatalogImportSelection(actual);
  if (normalized.conflictPolicy !== expected.conflictPolicy
    || !sameIds(normalized.sourceCategoryIds, expected.sourceCategoryIds)
    || !sameIds(normalized.sourceProductIds, expected.sourceProductIds)) {
    invalid("Persistence returned a different catalog import selection.");
  }
}

function assertCounts(categories: number, products: number): void {
  if (!Number.isSafeInteger(categories) || categories < 0 || !Number.isSafeInteger(products) || products < 0) {
    invalid("Persistence returned invalid importable counts.");
  }
}

function assertConflicts(selection: ProductCatalogImportSelection, conflicts: readonly ProductCatalogImportConflict[]): void {
  const selected = new Set<string>([
    ...selection.sourceCategoryIds.map((id) => `category:${id}`),
    ...selection.sourceProductIds.map((id) => `product:${id}`),
  ]);
  const seen = new Set<string>();
  for (const conflict of conflicts) {
    if (!selected.has(`${conflict.itemKind}:${conflict.sourceItemId}`) || !validConflict(conflict) || seen.has(`${conflict.itemKind}:${conflict.sourceItemId}:${conflict.reason}`)) {
      invalid("Persistence returned an invalid catalog import conflict.");
    }
    seen.add(`${conflict.itemKind}:${conflict.sourceItemId}:${conflict.reason}`);
  }
}

function validConflict(conflict: ProductCatalogImportConflict): boolean {
  const validReason = conflict.itemKind === "category"
    ? ["source_category_unsupported_master", "source_category_name_ambiguous", "destination_category_name_exists", "destination_category_name_ambiguous"]
    : ["source_product_sku_ambiguous", "source_product_barcode_ambiguous", "source_product_name_ambiguous", "source_product_category_not_selected", "source_product_unsupported_master", "destination_product_category_conflict", "destination_product_sku_exists", "destination_product_sku_ambiguous", "destination_product_barcode_exists", "destination_product_barcode_ambiguous", "destination_product_name_exists", "destination_product_name_ambiguous"];
  return (conflict.itemKind === "category" || conflict.itemKind === "product")
    && validReason.includes(conflict.reason)
    && typeof conflict.sourceItemId === "string" && !!conflict.sourceItemId.trim()
    && (conflict.destinationItemId === null || (typeof conflict.destinationItemId === "string" && !!conflict.destinationItemId.trim()));
}

function assertPartition<T extends ProductCategoryId | ProductId>(
  selected: readonly T[],
  created: readonly ProductCatalogImportCreatedItem[],
  skipped: readonly T[],
  label: ProductCatalogImportItemKind,
): void {
  const selectedIds = new Set(selected);
  const createdIds = created.map((item) => item.sourceItemId);
  const seen = new Set<string>();
  for (const item of created) {
    if (item.itemKind !== label || !selectedIds.has(item.sourceItemId as T) || !item.destinationItemId || seen.has(item.sourceItemId)) {
      invalid(`Persistence returned invalid created ${label} mappings.`);
    }
    seen.add(item.sourceItemId);
  }
  for (const id of skipped) {
    if (!selectedIds.has(id) || seen.has(id)) invalid(`Persistence returned invalid skipped ${label} IDs.`);
    seen.add(id);
  }
  if (seen.size !== selectedIds.size || [...selectedIds].some((id) => !seen.has(id)) || new Set(createdIds).size !== createdIds.length) {
    invalid(`Persistence returned an incomplete ${label} import receipt.`);
  }
}

function freezePreview(preview: ProductCatalogImportPreview): ProductCatalogImportPreview {
  return Object.freeze({ ...preview, selection: normalizeProductCatalogImportSelection(preview.selection),
    conflicts: Object.freeze(preview.conflicts.map((item) => Object.freeze({ ...item }))) });
}

function freezeResult(result: ProductCatalogImportResult): ProductCatalogImportResult {
  return Object.freeze({ ...result,
    createdCategories: Object.freeze(result.createdCategories.map((item) => Object.freeze({ ...item }))),
    skippedCategorySourceIds: Object.freeze([...result.skippedCategorySourceIds]),
    createdProducts: Object.freeze(result.createdProducts.map((item) => Object.freeze({ ...item }))),
    skippedProductSourceIds: Object.freeze([...result.skippedProductSourceIds]),
  });
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function snapshotToken(value: string, label: string): void {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    invalid(`The expected ${label} catalog snapshot token is invalid.`);
  }
}

function invalid(message: string): never {
  throw new ProductFailure("PRODUCT_CATALOG_IMPORT_INVALID", message);
}

async function repositoryCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof ProductFailure) throw cause;
    throw new ProductFailure("PRODUCT_REPOSITORY_UNAVAILABLE", "Product repository is unavailable.", { cause });
  }
}

export { ProductCatalogImportConflictPolicy };
