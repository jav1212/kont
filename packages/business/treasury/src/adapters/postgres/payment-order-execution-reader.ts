import { TreasuryFailure } from "../../domain/failure";
import type { TreasuryPostgresRpcClient } from "./index";

type GetPaymentOrder = { readonly actorId: string; readonly organizationId: string; readonly companyId: string; readonly id: string };
type TreasuryPaymentExecutionEvidence = { readonly paymentId: string; readonly paymentOrderId: string; readonly organizationId: string; readonly companyId: string; readonly amount: string; readonly currency: string; readonly occurredOn: string; readonly ledgerEntryId: string };

/** Reads Treasury-owned payment execution evidence through the authorized shared query RPC. */
export class PostgresPaymentOrderExecutionReader {
  /** Creates a reader scoped to one tenant.
   * @param client - Trusted server RPC client bound to the shared operational schema.
   * @param tenantId - Server-derived tenant identifier.
   * @returns A Treasury payment-execution reader.
   */
  public constructor(private readonly client: TreasuryPostgresRpcClient, private readonly tenantId: string) {}
  /** Reads the execution linked to an authorized payment order.
   * @param input - Authenticated order and organization scope.
   * @returns Execution evidence, or null when no execution exists.
   * @throws {TreasuryFailure} When SQL response or authorization is invalid.
   */
  public async getExecution(input: GetPaymentOrder): Promise<TreasuryPaymentExecutionEvidence | null> {
    try {
      const raw = await this.client.call("shared_treasury_query", { p_scope: { tenantId: this.tenantId, organizationId: input.organizationId, companyId: input.companyId, actorId: input.actorId }, p_query: { kind: "get_payment_order_execution", paymentOrderId: input.id, page: 1, pageSize: 1 } });
      const record = asRecord(raw); const items = record.items;
      if (!Array.isArray(items)) throw new TreasuryFailure("UNAVAILABLE", "Treasury execution response is malformed.");
      if (items.length === 0) return null;
      if (items.length !== 1) throw new TreasuryFailure("CONFLICT", "Treasury returned multiple executions for a payment order.");
      const item = asRecord(items[0]);
      return { paymentId: field(item, "paymentId"), paymentOrderId: field(item, "paymentOrderId"), organizationId: input.organizationId, companyId: input.companyId, amount: decimal(item.amount), currency: currency(item.currency), occurredOn: field(item, "occurredOn"), ledgerEntryId: field(item, "ledgerEntryId") };
    } catch (cause: unknown) { if (cause instanceof TreasuryFailure) throw cause; throw new TreasuryFailure("UNAVAILABLE", "Treasury execution reader is unavailable."); }
  }
}
function asRecord(value: unknown): Readonly<Record<string, unknown>> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TreasuryFailure("UNAVAILABLE", "Treasury execution response is malformed."); return value as Readonly<Record<string, unknown>>; }
function field(value: Readonly<Record<string, unknown>>, name: string): string { const result = value[name]; if (typeof result !== "string" || !result) throw new TreasuryFailure("UNAVAILABLE", `Treasury execution ${name} is malformed.`); return result; }
function decimal(value: unknown): string { const result = field({ value }, "value"); if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result)) throw new TreasuryFailure("UNAVAILABLE", "Treasury execution amount is malformed."); return result; }
function currency(value: unknown): string { const result = field({ value }, "value"); if (!/^[A-Z]{3}$/.test(result)) throw new TreasuryFailure("UNAVAILABLE", "Treasury execution currency is malformed."); return result; }
