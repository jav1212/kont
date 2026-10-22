import { companyId } from "@kontave/companies/domain";
import {
  PurchaseInvoiceBranchConfirmationFailure,
  type ConfirmPurchaseInvoiceForBranchCommand,
  type PurchaseInvoiceBranchConfirmation,
  type PurchaseInvoiceBranchConfirmationPort,
} from "../../application/branch-invoice-confirmation";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const response = z.object({
  id: z.string().trim().min(1).max(128),
  company_id: z.string().trim().min(1),
  status: z.literal("confirmada"),
  branch_id: z.string().uuid(),
});

/** Supabase service credentials required to call the protected branch confirmation RPC. */
export interface SupabasePurchaseInvoiceBranchConfirmationConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Server-side adapter for atomically confirming a purchase invoice with its branch. */
export class SupabasePurchaseInvoiceBranchConfirmationPort implements PurchaseInvoiceBranchConfirmationPort {
  /**
   * Creates a confirmation port whose service client remains inside trusted server composition.
   * @param client - Supabase client permitted to execute the protected confirmation RPC.
   * @returns A confirmation port bound to the supplied trusted Supabase client.
   */
  constructor(private readonly client: SupabaseClient) {}

  /** {@inheritDoc PurchaseInvoiceBranchConfirmationPort.confirm} */
  async confirm(command: ConfirmPurchaseInvoiceForBranchCommand): Promise<PurchaseInvoiceBranchConfirmation> {
    try {
      const { data, error } = await this.client.rpc("confirm_native_purchase_invoice_branch_secure", {
        p_actor_user_id: command.actorUserId,
        p_organization_id: command.organizationId,
        p_company_id: command.companyId,
        p_invoice_id: command.invoiceId,
        p_company_branch_id: command.branchId,
      });
      if (error) throw mapFailure(error.message, error);
      const parsed = response.safeParse(data);
      if (!parsed.success) throw new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_UNAVAILABLE", "Purchase invoice branch confirmation returned malformed data.", { cause: parsed.error });
      if (parsed.data.id !== command.invoiceId || parsed.data.company_id !== command.companyId || parsed.data.branch_id.toLowerCase() !== command.branchId) {
        throw new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_UNAVAILABLE", "Purchase invoice branch confirmation response does not match the requested scope.");
      }
      return Object.freeze({
        invoiceId: parsed.data.id,
        companyId: companyId(parsed.data.company_id),
        status: "confirmed",
        branchId: parsed.data.branch_id.toLowerCase(),
      });
    } catch (cause) {
      if (cause instanceof PurchaseInvoiceBranchConfirmationFailure) throw cause;
      throw new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_UNAVAILABLE", "Purchase invoice branch confirmation is unavailable.", { cause });
    }
  }
}

/**
 * Creates the trusted server port for protected branch-aware purchase invoice confirmation.
 * @param configuration - Supabase URL and server-only service role key.
 * @returns A port that validates every RPC response before exposing it.
 * @throws {PurchaseInvoiceBranchConfirmationFailure} When the remote call fails or returns invalid data.
 */
export function createSupabasePurchaseInvoiceBranchConfirmationPort(configuration: SupabasePurchaseInvoiceBranchConfirmationConfiguration): PurchaseInvoiceBranchConfirmationPort {
  return new SupabasePurchaseInvoiceBranchConfirmationPort(createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
}

function mapFailure(message: string, cause: unknown): PurchaseInvoiceBranchConfirmationFailure {
  if (message.includes("PURCHASE_BRANCH_ACCESS_DENIED") || message.includes("PURCHASE_BRANCH_NOT_FOUND")) return new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_ACCESS_DENIED", "Purchase invoice branch confirmation access was denied.");
  if (message.includes("PURCHASE_NOT_FOUND") || message.includes("PURCHASE_BRANCH_TRANSITION_INVALID")) return new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_CONFLICT", "Purchase invoice cannot be confirmed for the requested branch.");
  return new PurchaseInvoiceBranchConfirmationFailure("PURCHASE_BRANCH_CONFIRMATION_UNAVAILABLE", "Purchase invoice branch confirmation is unavailable.", { cause });
}
