import { RequireAuthorization } from "@kontave/access-control/application";
import { AuthorizationSource, PERMISSIONS, permissionCode } from "@kontave/access-control/domain";
import type { ProductCustomFieldsAccess, ProductCustomFieldsContext } from "../../application";
import { ProductFailure } from "../../domain";

/** Request metadata needed to audit an authorization decision. */
export interface ProductCustomFieldsAuthorizationMetadata {
  readonly requestId: string;
  readonly source: AuthorizationSource;
  readonly occurredAt: string;
}

/** Supplies access-control decisions for company-scoped product custom fields. */
export class AuthorizedProductCustomFieldsAccess implements ProductCustomFieldsAccess {
  /**
   * @param authorization - Shared access-control service used by server features.
   * @param metadata - Creates request identity, source and event time for each decision.
   * @returns A policy adapter that maps inventory permissions to custom-field operations.
   * @throws {ProductFailure} When required dependencies are missing.
   */
  constructor(
    private readonly authorization: RequireAuthorization,
    private readonly metadata: () => ProductCustomFieldsAuthorizationMetadata,
  ) {}

  /** @inheritdoc */
  assertCanReadCatalog(context: ProductCustomFieldsContext): Promise<void> {
    return this.assert(context, PERMISSIONS.INVENTORY_READ);
  }

  /** @inheritdoc */
  assertCanManageCatalog(context: ProductCustomFieldsContext): Promise<void> {
    return this.assert(context, PERMISSIONS.INVENTORY_UPDATE);
  }

  /** @inheritdoc */
  assertCanReadValues(context: ProductCustomFieldsContext): Promise<void> {
    return this.assert(context, PERMISSIONS.INVENTORY_READ);
  }

  /** @inheritdoc */
  assertCanUpdateValues(context: ProductCustomFieldsContext): Promise<void> {
    return this.assert(context, PERMISSIONS.INVENTORY_UPDATE);
  }

  private async assert(context: ProductCustomFieldsContext, permission: string): Promise<void> {
    try {
      await this.authorization.execute({
        actor: { userId: context.actorUserId, organizationId: context.organizationId },
        permission: permissionCode(permission),
        resource: { type: "company", id: context.companyId, companyId: context.companyId, organizationId: context.organizationId },
        context: this.metadata(),
      });
    } catch (cause: unknown) {
      throw new ProductFailure("PRODUCT_ACCESS_DENIED", "Product custom-field access was denied.", { cause });
    }
  }
}
