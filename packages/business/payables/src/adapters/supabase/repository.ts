import { PayablesFailure } from "../../domain/failure";
import type { ListPayablesQuery, PayablesCommandResult, PayablesRepository, PayablesWriteCommand, PayablesCommandScope, PayableListResult, PayablesReportQuery, PayablesReportResult } from "../../application/commands";

/** Structural subset of a Supabase client used by the payables boundary. */
export interface PayablesSupabaseClient {
  /**
   * @param functionName - Registered SQL RPC name.
   * @param args - JSON values passed to the RPC.
   * @returns RPC result and optional PostgREST error.
   * @throws Never; transport failures are represented by the returned error.
   */
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{ readonly data: unknown; readonly error: { readonly message: string; readonly code?: string } | null }>;
}

/** Adapts portable Accounts Payable commands and queries to Supabase RPCs. */
export class SupabasePayablesRepository implements PayablesRepository {
  /**
   * @param client - Trusted server Supabase client.
   * @returns Repository bound to the supplied RPC client.
   * @throws {PayablesFailure} When the client is missing.
   */
  public constructor(private readonly client: PayablesSupabaseClient) {
    if (!client) throw new PayablesFailure("INVALID", "Payables Supabase client is required.");
  }

  /** {@inheritDoc PayablesRepository.execute} */
  public async execute(scope: PayablesCommandScope, command: PayablesWriteCommand): Promise<PayablesCommandResult> {
    try {
      const rpcName = commandRpc(command.kind);
      const { data, error } = await this.client.rpc(rpcName, { p_scope: scope, p_command: command });
      if (error) throw mapFailure(error.code, error.message);
      if (!isRecord(data) || typeof data.commandId !== "string" || !Array.isArray(data.affectedIds)) throw new PayablesFailure("UNAVAILABLE", "Payables command returned an invalid response.");
      return { ...data, versions: isRecord(data.versions) ? data.versions as Record<string, number> : {} } as unknown as PayablesCommandResult;
    } catch (cause: unknown) {
      if (cause instanceof PayablesFailure) throw cause;
      throw new PayablesFailure("UNAVAILABLE", "The payables command could not be persisted.", { cause: cause instanceof Error ? cause : undefined });
    }
  }

  /** {@inheritDoc PayablesRepository.list} */
  public async list(query: ListPayablesQuery): Promise<PayableListResult> {
    try {
      const { data, error } = await this.client.rpc("shared_payables_query", { p_scope: { tenantId: query.tenantId, organizationId: query.organizationId, companyId: query.companyId, actorId: query.actorId }, p_query: { kind: "list_documents", status: query.status ?? null, supplierId: query.supplierId ?? null, limit: query.limit, offset: query.offset } });
      if (error) throw mapFailure(error.code, error.message);
      if (!isRecord(data) || !Array.isArray(data.rows) || typeof data.total !== "number") throw new PayablesFailure("UNAVAILABLE", "Payables query returned an invalid response.");
      return data as unknown as PayableListResult;
    } catch (cause: unknown) {
      if (cause instanceof PayablesFailure) throw cause;
      throw new PayablesFailure("UNAVAILABLE", "The payables query could not be loaded.", { cause: cause instanceof Error ? cause : undefined });
    }
  }

  /** {@inheritDoc PayablesRepository.report} */
  public async report(query: PayablesReportQuery): Promise<PayablesReportResult> {
    try {
      const { data, error } = await this.client.rpc(reportRpc(query.kind), {
        p_scope: { tenantId: query.tenantId, organizationId: query.organizationId, companyId: query.companyId, actorId: query.actorId },
        p_query: { ...(query.filters ?? {}), kind: query.kind, supplierId: query.supplierId ?? null, documentId: query.documentId ?? null, asOf: query.asOf ?? null, from: query.from ?? null, to: query.to ?? null, status: query.status ?? null, limit: query.limit, offset: query.offset },
      });
      if (error) throw mapFailure(error.code, error.message);
      if (!isRecord(data) || !Array.isArray(data.rows) || typeof data.total !== "number") throw new PayablesFailure("UNAVAILABLE", "Payables report returned an invalid response.");
      return data as unknown as PayablesReportResult;
    } catch (cause: unknown) {
      if (cause instanceof PayablesFailure) throw cause;
      throw new PayablesFailure("UNAVAILABLE", "The payables report could not be loaded.", { cause: cause instanceof Error ? cause : undefined });
    }
  }
}

// Reports with their own authorization or shape live outside the general reporting RPC.
function reportRpc(kind: PayablesReportQuery["kind"]): string {
  if (kind === "accounting_reconciliation") return "shared_payables_accounting_reconciliation";
  if (kind === "withholding_voucher") return "shared_payables_withholding_voucher";
  return "shared_payables_reporting_query";
}

// Each command family has its own SQL boundary; all share receipts and authorization rules.
function commandRpc(kind: PayablesWriteCommand["kind"]): string {
  switch (kind) {
    case "create_payment_batch": case "set_payment_batch_item": case "submit_payment_batch": case "authorize_payment_batch": return "shared_payables_batch_command";
    case "execute_supplier_payment": case "execute_payment_batch": case "void_supplier_payment": case "reverse_supplier_payment":
    case "configure_policy": case "decide_adjustment": case "mark_withholdings_declared": return "shared_payables_payment_command";
    case "post_payment_accounting": case "reverse_payment_accounting": return "shared_payables_accounting_command";
    default: return "shared_payables_execute_command";
  }
}

function mapFailure(code: string | undefined, message: string): PayablesFailure {
  if (message.includes("FORBIDDEN") || message.includes("ACCESS_DENIED")) return new PayablesFailure("FORBIDDEN", "The actor cannot perform this payables operation.");
  if (message.includes("NOT_FOUND")) return new PayablesFailure("NOT_FOUND", "The payable document was not found.");
  if (message.includes("VERSION_CONFLICT")) return new PayablesFailure("VERSION_CONFLICT", "The payable changed; reload it before retrying.");
  if (message.includes("IDEMPOTENCY_CONFLICT")) return new PayablesFailure("IDEMPOTENCY_CONFLICT", "The idempotency key was already used for another command.");
  if (message.includes("SOURCE_ALREADY_REGISTERED")) return new PayablesFailure("SOURCE_ALREADY_REGISTERED", "This source document already has an active payable.");
  if (message.includes("HAS_APPLICATIONS")) return new PayablesFailure("HAS_APPLICATIONS", "A payable with applications cannot be voided.");
  if (message.includes("CURRENCY_MISMATCH")) return new PayablesFailure("CURRENCY_MISMATCH", "Both documents must use the same currency.");
  if (message.includes("EXCEEDS_BALANCE")) return new PayablesFailure("EXCEEDS_BALANCE", "The application exceeds the open payable balance.");
  if (message.includes("PERIOD_CLOSED")) return new PayablesFailure("PERIOD_CLOSED", "The requested accounting period is closed.");
  if (message.includes("WITHHOLDING_DUPLICATE")) return new PayablesFailure("WITHHOLDING_DUPLICATE", "The document already has an active withholding of this kind.");
  if (message.includes("WITHHOLDING_DECLARED")) return new PayablesFailure("WITHHOLDING_DECLARED", "A withholding of this payment was already declared.");
  if (message.includes("APPROVAL_PENDING")) return new PayablesFailure("APPROVAL_PENDING", "The credit is waiting for a second approval.");
  if (message.includes("ACCOUNTING_RULES_MISSING")) return new PayablesFailure("ACCOUNTING_RULES_MISSING", "No active payables accounting rule applies to this payment.");
  if (message.includes("TREASURY_RECONCILED") || message.includes("TREASURY_INSUFFICIENT_FUNDS") || message.includes("TREASURY_TAX_POLICY_MISSING")
    || message.includes("TREASURY_NOT_FOUND") || message.includes("TREASURY_CONFLICT") || message.includes("TREASURY_INVALID")) {
    return new PayablesFailure("TREASURY_REJECTED", message.includes("INSUFFICIENT_FUNDS") ? "TREASURY_INSUFFICIENT_FUNDS" : message.includes("RECONCILED") ? "TREASURY_RECONCILED" : message.includes("TAX_POLICY_MISSING") ? "TREASURY_TAX_POLICY_MISSING" : "TREASURY_REJECTED");
  }
  if (message.includes("INVALID") || code === "22023") return new PayablesFailure("INVALID", "The payables command is invalid.");
  return new PayablesFailure("UNAVAILABLE", "The payables service is unavailable.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
