import type { ProductCategoryId } from "../domain";
import { normalizeProductCategoryAlias, ProductCategoryAlias, ProductFailure } from "../domain";
import type { ProductCatalogContext } from "./index";

/** Resolved canonical product-category target for an exact name or configured alias. */
export interface ProductCategoryAliasMatch {
  readonly categoryId: ProductCategoryId;
  readonly categoryName: string;
  readonly matchedAs: "canonical" | "alias";
}

/** Company-scoped alias management and exact import-resolution persistence boundary. */
export interface ProductCategoryAliasRepository {
  /**
   * Lists active alternate names for one canonical category.
   * @param context - Actor and company catalog scope.
   * @param categoryId - Canonical category whose aliases are requested.
   * @returns Active aliases in stable name order.
   * @throws {ProductFailure} When access or persistence fails.
   */
  listAliases(context: ProductCatalogContext, categoryId: ProductCategoryId): Promise<readonly ProductCategoryAlias[]>;
  /**
   * Adds one alternate name without changing the category's canonical name.
   * @param command - Actor, company, category, and alternate name.
   * @returns The newly persisted alias.
   * @throws {ProductFailure} When the category is absent, the name conflicts, or access fails.
   */
  createAlias(command: CreateProductCategoryAliasCommand): Promise<ProductCategoryAlias>;
  /**
   * Retires an active alternate name using optimistic concurrency.
   * @param command - Actor, company, alias, and expected revision.
   * @returns The retired alias snapshot.
   * @throws {ProductFailure} When the alias is absent, stale, or access fails.
   */
  retireAlias(command: ProductCategoryAliasVersionCommand): Promise<ProductCategoryAlias>;
  /**
   * Resolves an exact canonical category name or an active configured alias.
   * @param command - Actor, company, and source name from an import or search.
   * @returns The canonical category match, or `null` when no exact match exists.
   * @throws {ProductFailure} When input, access, or persistence is invalid.
   */
  resolveAlias(command: ResolveProductCategoryAliasCommand): Promise<ProductCategoryAliasMatch | null>;
}

/** Request to add an alternate name to one product category. */
export interface CreateProductCategoryAliasCommand extends ProductCatalogContext {
  readonly categoryId: ProductCategoryId;
  readonly alias: string;
}

/** Versioned request to retire one alternate category name. */
export interface ProductCategoryAliasVersionCommand extends ProductCatalogContext {
  readonly aliasId: string;
  readonly expectedVersion: number;
}

/** Exact source label that should resolve to a company's canonical product category. */
export interface ResolveProductCategoryAliasCommand extends ProductCatalogContext {
  readonly sourceName: string;
}

/** Lists the aliases assigned to one product category. */
export class ListProductCategoryAliases {
  /**
   * @param repository - Company-scoped alias persistence port.
   * @returns A use case for reading active category aliases.
   * @throws {ProductFailure} When the repository dependency is unavailable.
   */
  constructor(private readonly repository: ProductCategoryAliasRepository) {}

  /**
   * @param context - Actor and company catalog scope.
   * @param categoryId - Canonical category identifier.
   * @returns Active aliases for the requested category.
   * @throws {ProductFailure} When validation or persistence fails.
   */
  execute(context: ProductCatalogContext, categoryId: ProductCategoryId): Promise<readonly ProductCategoryAlias[]> {
    if (!categoryId) throw new ProductFailure("PRODUCT_CATEGORY_ALIAS_INVALID", "A product category is required.");
    return this.repository.listAliases(context, categoryId);
  }
}

/** Adds one company-scoped synonym while preserving the category's canonical identity. */
export class SetProductCategoryAlias {
  /**
   * @param repository - Company-scoped alias persistence port.
   * @returns A use case for adding category aliases.
   * @throws {ProductFailure} When the repository dependency is unavailable.
   */
  constructor(private readonly repository: ProductCategoryAliasRepository) {}

  /**
   * @param command - Category scope and alternate name.
   * @returns The persisted alias.
   * @throws {ProductFailure} When input, uniqueness, access, or persistence fails.
   */
  execute(command: CreateProductCategoryAliasCommand): Promise<ProductCategoryAlias> {
    const alias = normalizeProductCategoryAlias(command.alias);
    return this.repository.createAlias({ ...command, alias });
  }
}

/** Retires a synonym without deleting its history. */
export class RetireProductCategoryAlias {
  /**
   * @param repository - Company-scoped alias persistence port.
   * @returns A use case for retiring aliases.
   * @throws {ProductFailure} When the repository dependency is unavailable.
   */
  constructor(private readonly repository: ProductCategoryAliasRepository) {}

  /**
   * @param command - Alias identifier and expected revision.
   * @returns The retired alias.
   * @throws {ProductFailure} When input, access, revision, or persistence fails.
   */
  execute(command: ProductCategoryAliasVersionCommand): Promise<ProductCategoryAlias> {
    if (!command.aliasId.trim() || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 1) {
      throw new ProductFailure("PRODUCT_CATEGORY_ALIAS_INVALID", "The alias revision is invalid.");
    }
    return this.repository.retireAlias({ ...command, aliasId: command.aliasId.trim() });
  }
}

/** Resolves an exact source label to a canonical product category. */
export class ResolveProductCategoryAlias {
  /**
   * @param repository - Company-scoped alias persistence port.
   * @returns A use case for exact canonical-name and alias resolution.
   * @throws {ProductFailure} When the repository dependency is unavailable.
   */
  constructor(private readonly repository: ProductCategoryAliasRepository) {}

  /**
   * @param command - Actor, company, and exact source label.
   * @returns The canonical target, or `null` when no match exists.
   * @throws {ProductFailure} When the source label or persistence is invalid.
   */
  execute(command: ResolveProductCategoryAliasCommand): Promise<ProductCategoryAliasMatch | null> {
    const sourceName = normalizeProductCategoryAlias(command.sourceName);
    return this.repository.resolveAlias({ ...command, sourceName });
  }
}
