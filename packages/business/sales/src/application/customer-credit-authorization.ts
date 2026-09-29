import type { RequireAuthorization } from "@kontave/access-control/application";
import {
  PERMISSIONS,
  permissionCode,
  type AuthorizationRequest,
} from "@kontave/access-control/domain";
import {
  assessCustomerCredit,
  SalesFailure,
  type CustomerCreditAssessment,
  type CustomerCreditExposure,
} from "../domain";

/** Scope and immutable credit facts supplied by the invoice's authoritative transaction. */
export interface CustomerInvoiceCreditSnapshot extends CustomerCreditExposure {
  readonly organizationId: string;
  readonly companyId: string;
  readonly invoiceId: string;
  readonly customerId: string;
}

/** Transaction-bound reader; implementations must use the same lock as invoice confirmation. */
export interface CustomerInvoiceCreditReader {
  /**
   * Reads the persisted invoice amount, customer balance, and credit limit in one scope.
   * @param scope - Authorized organization, company, and invoice identity.
   * @returns Current credit facts, or null for an absent or inaccessible invoice.
   * @throws {SalesFailure} When the transaction cannot obtain authoritative facts.
   */
  read(scope: {
    readonly organizationId: string;
    readonly companyId: string;
    readonly invoiceId: string;
  }): Promise<CustomerInvoiceCreditSnapshot | null>;
}

/** Enforces invoice creation permission and the separate customer overdraft exception. */
export class RequireCustomerInvoiceCreditAuthorization {
  /**
   * Connects commercial credit assessment to effective role permissions.
   * @param credits - Trusted reader enlisted in the caller's invoice transaction.
   * @param authorization - Role authorization engine with its decision audit.
   * @returns A transaction-scoped credit authorization use case.
   */
  constructor(
    private readonly credits: CustomerInvoiceCreditReader,
    private readonly authorization: Pick<RequireAuthorization, "execute">,
  ) {}

  /**
   * Denies unauthorized invoice creation before reading debt, then requires an
   * explicit exception for existing or projected overdraft. The caller must
   * commit its invoice under the same lock; this result is not a reusable grant.
   * @param input - Authenticated actor, request evidence, company, and invoice identity.
   * @returns The assessed credit facts after all required permissions pass.
   * @throws {SalesFailure} When the scoped source is missing, inconsistent, or invalid.
   * @throws {AuthorizationDenied} When creation or the overdraft exception is denied.
   */
  async execute(input: {
    readonly actor: AuthorizationRequest["actor"];
    readonly context: AuthorizationRequest["context"];
    readonly companyId: string;
    readonly invoiceId: string;
  }): Promise<CustomerCreditAssessment> {
    const resource = {
      type: "sales_invoice",
      id: input.invoiceId,
      companyId: input.companyId,
      organizationId: input.actor.organizationId,
    };
    await this.authorization.execute({
      actor: input.actor,
      context: input.context,
      resource,
      permission: permissionCode(PERMISSIONS.SALES_CREATE),
    });
    const snapshot = await this.credits.read({
      organizationId: resource.organizationId,
      companyId: input.companyId,
      invoiceId: input.invoiceId,
    });
    if (!snapshot)
      throw new SalesFailure(
        "SALES_NOT_FOUND",
        "Invoice credit facts are unavailable in this scope.",
      );
    if (
      snapshot.organizationId !== resource.organizationId ||
      snapshot.companyId !== input.companyId ||
      snapshot.invoiceId !== input.invoiceId ||
      !snapshot.customerId.trim()
    ) {
      throw new SalesFailure(
        "SALES_CREDIT_INVALID",
        "Invoice credit facts do not match the authorized scope.",
      );
    }
    const assessment = assessCustomerCredit(snapshot);
    if (assessment.requiresOverride) {
      await this.authorization.execute({
        actor: input.actor,
        context: input.context,
        resource,
        permission: permissionCode(PERMISSIONS.SALES_OVERDRAWN_CUSTOMER_BILL),
      });
    }
    return assessment;
  }
}
