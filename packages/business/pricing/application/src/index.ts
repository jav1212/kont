import type { CompanyId } from "@kontave/companies/domain";
import { PricingFailure, type ProductSalePricing, type SalePricingPolicy } from "@kontave/pricing-domain";
import type { ProductId } from "@kontave/products-domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

export interface PricingContext {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
}

export interface ProductSalePricingRepository {
  /**
   * Loads sale pricing for one scoped product.
   *
   * @param context - Actor, organization and company scope.
   * @param productId - Product whose pricing is requested.
   * @returns The pricing aggregate, or `null` when none exists.
   * @throws {PricingFailure} When persistence or access fails.
   */
  get(context: PricingContext, productId: ProductId): Promise<ProductSalePricing | null>;
  /**
   * Saves a sale-pricing policy with optimistic concurrency.
   *
   * @param context - Actor, organization and company scope.
   * @param productId - Product whose policy is changed.
   * @param policy - New policy, or `null` to remove explicit pricing.
   * @param expectedVersion - Version that must currently be stored.
   * @returns The authoritative persisted aggregate.
   * @throws {PricingFailure} When validation, access, persistence or concurrency fails.
   */
  save(context: PricingContext, productId: ProductId, policy: SalePricingPolicy | null, expectedVersion: number): Promise<ProductSalePricing>;
}

/** Reads the required sale-pricing aggregate for a product. */
export class GetProductSalePricing {
  /** @param repository - Product sale-pricing persistence port. */
  constructor(private readonly repository: ProductSalePricingRepository) {}

  /**
   * Loads sale pricing for a scoped product.
   *
   * @param context - Actor, organization and company scope.
   * @param productId - Product whose pricing is requested.
   * @returns The existing pricing aggregate.
   * @throws {PricingFailure} When pricing is absent or the repository fails.
   */
  async execute(context: PricingContext, productId: ProductId): Promise<ProductSalePricing> {
    try {
      const value = await this.repository.get(context, productId);
      if (!value) throw new PricingFailure("PRICING_PRODUCT_NOT_FOUND", "Product pricing was not found.");
      return value;
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

/** Updates a product sale-pricing policy with optimistic concurrency. */
export class UpdateProductSalePricing {
  /** @param repository - Product sale-pricing persistence port. */
  constructor(private readonly repository: ProductSalePricingRepository) {}

  /**
   * Validates and saves a product sale-pricing policy.
   *
   * @param context - Actor, organization and company scope.
   * @param productId - Product whose policy is changed.
   * @param policy - New policy or `null`.
   * @param expectedVersion - Positive version that must currently be stored.
   * @returns The authoritative persisted aggregate.
   * @throws {PricingFailure} When validation, persistence or concurrency fails.
   */
  execute(
    context: PricingContext,
    productId: ProductId,
    policy: SalePricingPolicy | null,
    expectedVersion: number,
  ): Promise<ProductSalePricing> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new PricingFailure("PRICING_INVALID", "Expected pricing version is invalid.");
    }
    try {
      return this.repository.save(context, productId, policy, expectedVersion)
        .catch((cause: unknown) => { throw repositoryFailure(cause); });
    } catch (cause: unknown) {
      throw repositoryFailure(cause);
    }
  }
}

function repositoryFailure(cause: unknown): PricingFailure {
  if (cause instanceof PricingFailure) return cause;
  return new PricingFailure("PRICING_REPOSITORY_UNAVAILABLE", "Pricing repository is unavailable.", { cause });
}
