import type { CompanyId } from "@kontave/companies/domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";

/** Authorized command to confirm a purchase invoice and bind it to one company branch. */
export interface ConfirmPurchaseInvoiceForBranchCommand {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly invoiceId: string;
  readonly branchId: string;
}

/** Minimal durable result returned after branch-aware purchase invoice confirmation. */
export interface PurchaseInvoiceBranchConfirmation {
  readonly invoiceId: string;
  readonly companyId: CompanyId;
  readonly status: "confirmed";
  readonly branchId: string;
}

/** Atomic persistence boundary for protected branch-aware invoice confirmation. */
export interface PurchaseInvoiceBranchConfirmationPort {
  /**
   * Confirms the scoped purchase invoice and persists its branch attribution atomically.
   * @param command - Validated actor, company, invoice, and branch identity.
   * @returns The confirmed invoice identity and attributed branch.
   * @throws {PurchaseInvoiceBranchConfirmationFailure} When access, status, or persistence rejects the command.
   */
  confirm(command: ConfirmPurchaseInvoiceForBranchCommand): Promise<PurchaseInvoiceBranchConfirmation>;
}

/** Stable expected failures for protected branch-aware purchase invoice confirmation. */
export type PurchaseInvoiceBranchConfirmationFailureCode =
  | "PURCHASE_BRANCH_CONFIRMATION_INVALID"
  | "PURCHASE_BRANCH_CONFIRMATION_ACCESS_DENIED"
  | "PURCHASE_BRANCH_CONFIRMATION_CONFLICT"
  | "PURCHASE_BRANCH_CONFIRMATION_UNAVAILABLE";

/** Expected failure exposed by branch-aware purchase invoice confirmation. */
export class PurchaseInvoiceBranchConfirmationFailure extends Error {
  /**
   * Creates a typed branch-aware purchase confirmation failure.
   * @param code - Stable failure code.
   * @param message - Safe explanation suitable for application handling.
   * @param options - Optional underlying cause for diagnostics.
   * @returns A typed error instance carrying the stable failure code.
   */
  constructor(readonly code: PurchaseInvoiceBranchConfirmationFailureCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PurchaseInvoiceBranchConfirmationFailure";
  }
}

/** Confirms a purchase invoice through the branch-aware atomic persistence boundary. */
export class ConfirmPurchaseInvoiceForBranch {
  /**
   * Creates the protected branch-aware confirmation command.
   * @param port - Persistence boundary that authorizes and atomically confirms the invoice.
   * @returns A configured branch-aware invoice confirmation command.
   */
  constructor(private readonly port: PurchaseInvoiceBranchConfirmationPort) {}

  /**
   * Validates the command before confirming its invoice under the selected branch.
   * @param command - Actor, organization, company, invoice, and branch identities.
   * @returns The immutable confirmed invoice result.
   * @throws {PurchaseInvoiceBranchConfirmationFailure} When input, access, state, or persistence rejects the command.
   */
  async execute(command: ConfirmPurchaseInvoiceForBranchCommand): Promise<PurchaseInvoiceBranchConfirmation> {
    const normalized = validateConfirmPurchaseInvoiceForBranchCommand(command);
    try {
      return await this.port.confirm(normalized);
    } catch (cause) {
      if (cause instanceof PurchaseInvoiceBranchConfirmationFailure) throw cause;
      throw new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_UNAVAILABLE", "Purchase invoice branch confirmation is unavailable.", { cause });
    }
  }
}

/**
 * Validates and freezes a branch-aware purchase invoice confirmation command.
 * @param command - Caller-supplied actor, company, invoice, and branch identity.
 * @returns A normalized command whose invoice and branch identity are safe for persistence.
 * @throws {PurchaseInvoiceBranchConfirmationFailure} When the command is outside the supported shape.
 */
export function validateConfirmPurchaseInvoiceForBranchCommand(command: ConfirmPurchaseInvoiceForBranchCommand): ConfirmPurchaseInvoiceForBranchCommand {
  if (typeof command.actorUserId !== "string" || !command.actorUserId.trim()
    || typeof command.organizationId !== "string" || !command.organizationId.trim()
    || typeof command.companyId !== "string" || !command.companyId.trim()) throw invalid("Purchase invoice confirmation scope is required.");
  if (typeof command.invoiceId !== "string" || !command.invoiceId.trim() || command.invoiceId.trim().length > 128) throw invalid("Purchase invoice identifier is invalid.");
  if (typeof command.branchId !== "string" || !uuid.test(command.branchId)) throw invalid("Company branch identifier must be a UUID.");
  return Object.freeze({ ...command, invoiceId: command.invoiceId.trim(), branchId: command.branchId.toLowerCase() });
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(message: string): PurchaseInvoiceBranchConfirmationFailure {
  return new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_INVALID", message);
}
