import type { SupabaseClient } from "@supabase/supabase-js";
import { TaxReportingFailure, type TaxReportingFailureCode } from "../../domain/tax-reporting-failure";
import type { TaxReportingScope } from "../../domain/tax-reporting-fact";
import type { VatFiscalPeriodicity } from "../../domain/vat-fiscal-period";
import type { ConfigureVatPeriodicityCommand, VatPeriodicityChange, VatPeriodicityRepository, VatPeriodicitySetting } from "../../domain/vat-periodicity";

/** Server adapter for the audited company VAT periodicity RPCs. */
export class SupabaseVatPeriodicityRepository implements VatPeriodicityRepository {
  /**
   * Creates the adapter over a server Supabase client.
   * @param client - Service-role client for restricted periodicity RPCs.
   * @throws {TaxReportingFailure} When no client is available.
   */
  constructor(private readonly client: SupabaseClient) { if (!client) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "VAT periodicity needs a server database client."); }
  /** {@inheritDoc VatPeriodicityRepository.get} */
  async get(scope: TaxReportingScope, actorId: string): Promise<VatPeriodicitySetting> {
    const { data, error } = await this.client.rpc("shared_tax_reporting_periodicity_read", { p_tenant_id: scope.tenantId, p_organization_id: scope.organizationId, p_company_id: scope.companyId, p_actor_id: actorId });
    if (error) throw fromDatabase(error.message, error.code);
    const row = object(data);
    if (!row || !Number.isInteger(row.persistedPeriods) || !Array.isArray(row.events)) throw malformed();
    return Object.freeze({ periodicity: nullablePeriodicity(row.periodicity), persistedPeriods: row.persistedPeriods as number, changes: Object.freeze(row.events.map(decodeChange)) });
  }
  /** {@inheritDoc VatPeriodicityRepository.set} */
  async set(scope: TaxReportingScope, command: ConfigureVatPeriodicityCommand): Promise<{ readonly periodicity: VatFiscalPeriodicity; readonly replayed: boolean }> {
    const { data, error } = await this.client.rpc("shared_tax_reporting_periodicity_set", { p_tenant_id: scope.tenantId, p_organization_id: scope.organizationId, p_company_id: scope.companyId, p_actor_id: command.actorId, p_periodicity: command.periodicity, p_expected_periodicity: command.expectedPeriodicity, p_reason: command.reason, p_idempotency_key: command.idempotencyKey });
    if (error) throw fromDatabase(error.message, error.code);
    const row = object(data);
    const periodicity = nullablePeriodicity(row?.periodicity);
    if (!row || periodicity === null || typeof row.replayed !== "boolean") throw malformed();
    return { periodicity, replayed: row.replayed };
  }
}

/** Creates the periodicity repository using restricted Supabase RPCs.
 * @param client - Server-side Supabase client.
 * @returns Company-scoped periodicity repository.
 * @throws {TaxReportingFailure} When no client is available.
 */
export function createSupabaseVatPeriodicityRepository(client: SupabaseClient): SupabaseVatPeriodicityRepository { return new SupabaseVatPeriodicityRepository(client); }

const KNOWN: ReadonlySet<string> = new Set<TaxReportingFailureCode>(["TAX_REPORTING_INVALID", "TAX_REPORTING_SCOPE", "TAX_REPORTING_IDEMPOTENCY_CONFLICT", "TAX_REPORTING_CONCURRENCY_CONFLICT", "TAX_REPORTING_PERIODICITY_LOCKED"]);
function fromDatabase(message: string, code?: string): TaxReportingFailure {
  if (["PGRST202", "42883"].includes(code ?? "")) return new TaxReportingFailure("TAX_REPORTING_UNAVAILABLE", "VAT periodicity persistence is not installed.");
  // Organization security assertions report missing permission or company outside the actor's scope.
  if (/ORGANIZATIONAL_USER_[A-Z_]+/.test(message)) return new TaxReportingFailure("TAX_REPORTING_SCOPE", "The actor cannot manage this company's VAT periodicity.");
  const match = /TAX_REPORTING_[A-Z_]+/.exec(message)?.[0] ?? "";
  return new TaxReportingFailure(KNOWN.has(match) ? match as TaxReportingFailureCode : "TAX_REPORTING_UNAVAILABLE", message);
}
function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function nullablePeriodicity(value: unknown): VatFiscalPeriodicity | null { if (value === null || value === undefined) return null; if (value === "monthly" || value === "fortnightly") return value; throw malformed(); }
function decodeChange(value: unknown): VatPeriodicityChange {
  const row = object(value);
  const to = nullablePeriodicity(row?.to);
  if (!row || to === null || typeof row.actorId !== "string" || typeof row.occurredAt !== "string" || (row.reason !== null && typeof row.reason !== "string")) throw malformed();
  return Object.freeze({ from: nullablePeriodicity(row.from), to, actorId: row.actorId, reason: row.reason as string | null, occurredAt: row.occurredAt });
}
function malformed(): TaxReportingFailure { return new TaxReportingFailure("TAX_REPORTING_UNAVAILABLE", "VAT periodicity response is malformed."); }
