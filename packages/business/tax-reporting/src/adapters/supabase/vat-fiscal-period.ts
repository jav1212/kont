import { TaxReportingFailure } from "../../domain/tax-reporting-failure";
import { openVatFiscalPeriod, vatFiscalPeriod, type VatFiscalPeriod, type VatFiscalPeriodEvent, type VatFiscalPeriodRepository, type VatFiscalPeriodTransition, type VatFiscalPeriodStatus } from "../../domain";
import type { TaxReportingScope } from "../../domain/tax-reporting-fact";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Server adapter for company VAT fiscal-period snapshots and commands. */
export class SupabaseVatFiscalPeriodRepository implements VatFiscalPeriodRepository {
  /**
   * Creates the adapter over a server Supabase client.
   * @param client - Service-role client for restricted fiscal-period RPCs.
   * @throws {TaxReportingFailure} When no client is available.
   */
  constructor(private readonly client: SupabaseClient) { if (!client) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Fiscal periods need a server database client."); }
  /** {@inheritDoc VatFiscalPeriodRepository.get} */
  async get(scope: TaxReportingScope, periodKey: string, actorId: string): Promise<VatFiscalPeriod | null> {
    const { data, error } = await this.client.rpc("shared_tax_reporting_period_read", { p_tenant_id: scope.tenantId, p_organization_id: scope.organizationId, p_company_id: scope.companyId, p_actor_id: actorId, p_period_key: periodKey });
    if (error) throw fromDatabase(error.message, error.code);
    const row = object(data);
    if (!row) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Fiscal period response is malformed.");
    const periodicity = row.periodicity === "monthly" || row.periodicity === "fortnightly" ? row.periodicity : null;
    const events = Array.isArray(row.events) ? row.events.map(decodeEvent) : [];
    const period = periodicity === null
      ? openVatFiscalPeriod({ scope, periodKey, periodicity: null })
      : vatFiscalPeriod({ scope, periodKey, periodicity, status: status(row.status), version: integer(row.version), declarationId: nullableText(row.declarationId), events, pending: Array.isArray(row.pending) ? row.pending.filter((item): item is string => typeof item === "string") : [] });
    if (periodicity === null) return period;
    return period;
  }
  /** {@inheritDoc VatFiscalPeriodRepository.transition} */
  async transition(period: VatFiscalPeriod, command: VatFiscalPeriodTransition): Promise<{ readonly period: VatFiscalPeriod; readonly replayed: boolean }> {
    const { data, error } = await this.client.rpc("shared_tax_reporting_period_transition", { p_tenant_id: period.scope.tenantId, p_organization_id: period.scope.organizationId, p_company_id: period.scope.companyId, p_actor_id: command.actorId, p_period_key: period.periodKey, p_target_status: command.to, p_expected_version: command.expectedVersion, p_idempotency_key: command.idempotencyKey, p_reason: command.reason ?? null, p_declaration_id: command.declarationId ?? null, p_occurred_at: command.occurredAt });
    if (error) throw fromDatabase(error.message, error.code);
    const response = object(data);
    const saved = object(response?.period);
    if (!response || !saved) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Fiscal period transition response is malformed.");
    const event: VatFiscalPeriodEvent = Object.freeze({ from: period.status, to: status(saved.status), actorId: command.actorId, occurredAt: command.occurredAt, reason: command.reason ?? null, idempotencyKey: command.idempotencyKey, version: integer(saved.version), declarationId: command.declarationId ?? null });
    const updated = vatFiscalPeriod({ ...period, status: status(saved.status), version: integer(saved.version), declarationId: nullableText(saved.declarationId), events: response.replayed === true ? period.events : [...period.events, event], pending: [] });
    return { period: updated, replayed: response.replayed === true };
  }
}

/** Creates a fiscal-period repository using restricted Supabase RPCs.
 * @param client - Server-side Supabase client.
 * @returns Company-scoped fiscal-period repository.
 */
export function createSupabaseVatFiscalPeriodRepository(client: SupabaseClient): SupabaseVatFiscalPeriodRepository { return new SupabaseVatFiscalPeriodRepository(client); }
function object(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function status(value: unknown): VatFiscalPeriodStatus { if (["open","in_review","prepared","declared","paid","closed"].includes(String(value))) return value as VatFiscalPeriodStatus; throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Fiscal period status is invalid."); }
function integer(value: unknown): number { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 0) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Fiscal period version is invalid."); return parsed; }
function nullableText(value: unknown): string | null { if (value === null || value === undefined) return null; if (typeof value !== "string") throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Fiscal period declaration reference is invalid."); return value; }
function decodeEvent(value: unknown): VatFiscalPeriodEvent { const row = object(value); if (!row || typeof row.to !== "string" || typeof row.actorId !== "string" || typeof row.occurredAt !== "string" || typeof row.idempotencyKey !== "string") throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Fiscal period event is invalid."); return { from: row.from === null ? null : status(row.from), to: status(row.to), actorId: row.actorId, occurredAt: row.occurredAt, reason: nullableText(row.reason), idempotencyKey: row.idempotencyKey, version: integer(row.version), declarationId: nullableText(row.declarationId) }; }
function fromDatabase(message: string, code?: string): TaxReportingFailure { if (["PGRST202","42883"].includes(code ?? "")) return new TaxReportingFailure("TAX_REPORTING_UNAVAILABLE", "Fiscal-period persistence is not installed."); const match = /TAX_REPORTING_[A-Z_]+/.exec(message)?.[0]; const known = new Set(["TAX_REPORTING_INVALID","TAX_REPORTING_SCOPE","TAX_REPORTING_IDEMPOTENCY_CONFLICT","TAX_REPORTING_CONCURRENCY_CONFLICT","TAX_REPORTING_PERIOD_CLOSED","TAX_REPORTING_PERIOD_TRANSITION_INVALID","TAX_REPORTING_PERIODICITY_UNCONFIGURED"]); return new TaxReportingFailure(known.has(match ?? "") ? match as TaxReportingFailure["code"] : "TAX_REPORTING_INVALID", message); }
