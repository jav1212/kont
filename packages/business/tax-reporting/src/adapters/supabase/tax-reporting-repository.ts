import type { SupabaseClient } from "@supabase/supabase-js";
import { encodeFiscalDocument } from "@kontave/fiscal/supabase";
import type { FiscalIssuanceAttempt } from "@kontave/fiscal/domain";
import { taxReportingFact, taxReportingFactPageRequest, vatDeclaration, type TaxReportingFact, type TaxReportingFactBatchRepository, type TaxReportingFactPageRequest, type TaxReportingFactRepository, type TaxReportingScope } from "../../domain";
import type { IssuedFiscalDocumentTaxFactRepository, VatDeclarationRepository } from "../../application";
import type { LegacyVatSourcePage, LegacyVatSourceReader, LegacyVatSourceRecord, LegacyVatReadDirection } from "../../application/legacy-vat-source";
import type { VatDeclarationHistoryRepository } from "../../application";
import type { VatDeclaration } from "../../domain";
import { TaxReportingFailure } from "../../domain";


/** Supabase adapter for service-role-only, company-scoped reporting RPCs. */
export class SupabaseTaxReportingRepository implements TaxReportingFactRepository, TaxReportingFactBatchRepository, IssuedFiscalDocumentTaxFactRepository, LegacyVatSourceReader, VatDeclarationRepository, VatDeclarationHistoryRepository {
  /** @param client - Server-only Supabase client. @throws {TaxReportingFailure} If client is absent. */
  constructor(private readonly client: SupabaseClient) { if (!client) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Tax reporting needs a server database client."); }
  /** {@inheritDoc TaxReportingFactRepository.persist} */
  async persist(input: { readonly fact: TaxReportingFact; readonly actorId: string; readonly idempotencyKey: string }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }> {
    const { fact } = input; const { data, error } = await this.client.rpc("shared_tax_reporting_fact_append", { p_tenant_id: fact.scope.tenantId, p_organization_id: fact.scope.organizationId, p_company_id: fact.scope.companyId, p_fact_id: fact.id, p_fact_snapshot: JSON.parse(encode(fact)), p_actor_id: input.actorId, p_idempotency_key: input.idempotencyKey });
    if (error) throw failure(error.message, error.code); const row = record(data); return { fact: decodeFact(row.fact_snapshot), replayed: bool(row.replayed) };
  }
  /** Persists a validated source batch through one transactional database function.
   * @param input - Same-scope fact snapshots, reviewer, and stable batch identity.
   * @returns Persisted facts and whether the exact batch was replayed.
   * @throws {TaxReportingFailure} If a fact, scope, or batch command conflicts.
   */
  async persistBatch(input: { readonly scope: TaxReportingScope; readonly facts: readonly { readonly fact: TaxReportingFact; readonly idempotencyKey: string }[]; readonly actorId: string; readonly idempotencyKey: string }): Promise<{ readonly facts: readonly TaxReportingFact[]; readonly replayed: boolean }> {
    const batch = input.facts.map(({ fact, idempotencyKey }) => {
      if (fact.scope.tenantId !== input.scope.tenantId || fact.scope.organizationId !== input.scope.organizationId || fact.scope.companyId !== input.scope.companyId) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Batch facts must share the authorized company scope.");
      return { factId: fact.id, factSnapshot: JSON.parse(encode(fact)), idempotencyKey };
    });
    const { data, error } = await this.client.rpc("shared_tax_reporting_fact_append_batch", {
      p_tenant_id: input.scope.tenantId, p_organization_id: input.scope.organizationId, p_company_id: input.scope.companyId,
      p_actor_id: input.actorId, p_batch_idempotency_key: input.idempotencyKey, p_facts: batch,
    });
    if (error) throw failure(error.message, error.code);
    const result = record(data);
    if (!Array.isArray(result.facts)) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Atomic fact batch response is invalid.");
    return { facts: result.facts.map((item) => decodeFact(record(item))), replayed: bool(result.replayed) };
  }
  /** {@inheritDoc IssuedFiscalDocumentTaxFactRepository.persistIssued} */
  async persistIssued(input: { readonly attempt: FiscalIssuanceAttempt; readonly fact: TaxReportingFact; readonly actorId: string; readonly idempotencyKey: string }): Promise<{ readonly fact: TaxReportingFact; readonly replayed: boolean }> {
    const { attempt, fact } = input;
    if (attempt.issuedDocument === null || attempt.state !== "accepted" || fact.scope.companyId !== attempt.issuedDocument.companyId) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Accepted issuance and reporting fact scopes are inconsistent.");
    const attemptSnapshot = {
      id: attempt.id,
      documentId: attempt.documentId,
      provider: attempt.provider,
      idempotencyKey: attempt.idempotencyKey,
      state: attempt.state,
      requestFingerprint: attempt.requestFingerprint,
      providerReference: attempt.providerReference,
      failureCode: attempt.failureCode,
      occurredAt: attempt.occurredAt,
      issuedDocument: JSON.parse(encodeFiscalDocument(attempt.issuedDocument)) as Record<string, unknown>,
    };
    const { data, error } = await this.client.rpc("shared_fiscal_document_record_issuance_with_tax_fact", {
      p_tenant_id: fact.scope.tenantId,
      p_organization_id: fact.scope.organizationId,
      p_company_id: fact.scope.companyId,
      p_attempt: attemptSnapshot,
      p_fact_snapshot: JSON.parse(encode(fact)),
      p_actor_id: input.actorId,
      p_fact_idempotency_key: input.idempotencyKey,
    });
    if (error) throw failure(error.message, error.code);
    const result = record(data);
    return { fact: decodeFact(result.fact_snapshot), replayed: bool(result.replayed) };
  }
  /** {@inheritDoc TaxReportingFactRepository.list} */
  async list(scope: TaxReportingScope, request: TaxReportingFactPageRequest, actorId: string) {
    const normalized = taxReportingFactPageRequest(request);
    const periodScoped = normalized.period !== undefined;
    const { data, error } = await this.client.rpc(periodScoped ? "shared_tax_reporting_fact_list_period" : "shared_tax_reporting_fact_list", periodScoped
      ? { p_tenant_id: scope.tenantId, p_organization_id: scope.organizationId, p_company_id: scope.companyId, p_actor_id: actorId, p_period: normalized.period, p_limit: normalized.limit, p_cursor_recognition_date: normalized.cursor?.recognitionDate ?? null, p_cursor_id: normalized.cursor?.id ?? null }
      : { p_tenant_id: scope.tenantId, p_organization_id: scope.organizationId, p_company_id: scope.companyId, p_actor_id: actorId, p_from: normalized.from, p_to: normalized.to, p_limit: normalized.limit, p_cursor_recognition_date: normalized.cursor?.recognitionDate ?? null, p_cursor_id: normalized.cursor?.id ?? null });
    if (error) throw failure(error.message, error.code); const page = record(data); if (!Array.isArray(page.items)) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Reporting page is invalid."); return { items: page.items.map((item) => decodeFact(record(item).fact_snapshot)), nextCursor: page.nextCursor === null ? null : { recognitionDate: text(record(page.nextCursor).recognitionDate), id: text(record(page.nextCursor).id) } };
  }
  /** Reads legacy sources through a server-only RPC; this method never guesses rate categories or money semantics. @param input - Scoped source range, direction, and keyset bound. @returns Structurally decoded source page for an explicit mapper/reviewer. @throws {TaxReportingFailure} On malformed or unauthorized source data. */
  async readLegacyVatSources(input: { readonly scope: TaxReportingScope; readonly actorId: string; readonly direction: LegacyVatReadDirection; readonly from: string; readonly to: string; readonly period?: string; readonly cursor: string | null; readonly limit: number }): Promise<LegacyVatSourcePage> {
    if (!input.actorId.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to) || input.from > input.to || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy VAT read bounds are invalid.");
    if (input.period !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period)) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy VAT period is invalid.");
    const cursor = input.cursor === null ? null : legacyCursor(input.cursor);
    const rpc = input.period === undefined ? "read_iva_legacy_sources" : "read_iva_legacy_sources_period";
    const args = input.period === undefined
      ? { p_tenant_id: input.scope.tenantId, p_organization_id: input.scope.organizationId, p_company_id: input.scope.companyId, p_actor_user_id: input.actorId, p_direction: input.direction, p_from: input.from, p_to: input.to, p_after_date: cursor?.date ?? null, p_after_id: cursor?.id ?? null, p_limit: input.limit }
      : { p_tenant_id: input.scope.tenantId, p_organization_id: input.scope.organizationId, p_company_id: input.scope.companyId, p_actor_user_id: input.actorId, p_direction: input.direction, p_period: input.period, p_after_date: cursor?.date ?? null, p_after_id: cursor?.id ?? null, p_limit: input.limit };
    const { data, error } = await this.client.rpc(rpc, args);
    if (error) throw failure(error.message, error.code); const page = record(data); if (!Array.isArray(page.documents) || typeof page.hasMore !== "boolean") throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy VAT source page is invalid.");
    return { documents: page.documents.map(decodeLegacySource), hasMore: page.hasMore, nextCursor: page.nextCursor === null ? null : JSON.stringify({ date: text(record(page.nextCursor).date), id: text(record(page.nextCursor).id) }) };
  }
  /** Reads append-only declaration revisions through the cross-book-scoped history RPC. @param scope - Tenant/organization/company owner. @param request - Period window and keyset page. @param actorId - Authenticated caller checked again by persistence. @returns Historical revisions and a stable cursor. @throws {TaxReportingFailure} On unauthorized or malformed RPC results. */
  async listDeclarations(scope: TaxReportingScope, request: { readonly fromPeriod: string; readonly toPeriod: string; readonly limit: number; readonly cursor: { readonly period: string; readonly id: string; readonly revision: number } | null }, actorId: string) {
    const { data, error } = await this.client.rpc("shared_tax_reporting_declaration_list", {
      p_tenant_id: scope.tenantId, p_organization_id: scope.organizationId, p_company_id: scope.companyId, p_actor_id: actorId,
      p_from_period: request.fromPeriod, p_to_period: request.toPeriod, p_limit: request.limit,
      p_cursor_period: request.cursor?.period ?? null, p_cursor_id: request.cursor?.id ?? null, p_cursor_revision: request.cursor?.revision ?? null,
    });
    if (error) throw failure(error.message, error.code);
    const page = record(data);
    if (!Array.isArray(page.items)) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Declaration history page is invalid.");
    const cursor = page.nextCursor === null ? null : record(page.nextCursor);
    return {
      items: page.items.map(decodeDeclaration),
      nextCursor: cursor === null ? null : { period: text(cursor.period), id: text(cursor.id), revision: integer(cursor.revision) },
    };
  }
  /** {@inheritDoc VatDeclarationRepository.save} */
  async save(input: { readonly declaration: VatDeclaration; readonly actorId: string; readonly idempotencyKey: string; readonly expectedRevision: number | null }): Promise<{ readonly declaration: VatDeclaration; readonly replayed: boolean }> {
    const value = vatDeclaration(input.declaration); if (!input.actorId.trim() || !input.idempotencyKey.trim() || input.idempotencyKey.length > 128) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Declaration actor and idempotency key are required."); const { data, error } = await this.client.rpc("shared_tax_reporting_declaration_save", { p_tenant_id: value.scope.tenantId, p_organization_id: value.scope.organizationId, p_company_id: value.scope.companyId, p_declaration_id: value.id, p_declaration_snapshot: JSON.parse(encode(value)), p_actor_id: input.actorId.trim(), p_idempotency_key: input.idempotencyKey.trim(), p_expected_revision: input.expectedRevision });
    if (error) throw failure(error.message, error.code); const row = record(data); return { declaration: decodeDeclaration(row.declaration_snapshot), replayed: bool(row.replayed) };
  }
}
/** Serializes bigint money values losslessly for JSONB. @param value - Domain state. @returns JSON text. */
export function encode(value: unknown): string { return JSON.stringify(value, (_key, nested: unknown) => typeof nested === "bigint" ? nested.toString() : nested); }
/** Decodes a stored reporting snapshot. @param value - JSONB snapshot. @returns Valid fact. @throws {TaxReportingFailure} On malformed persistence. */
export function decodeFact(value: unknown): TaxReportingFact { const decoded = revive(value) as TaxReportingFact; return taxReportingFact({ ...decoded, affectedSourceId: decoded.affectedSourceId ?? null, counterpartyFiscalProfile: decoded.counterpartyFiscalProfile ?? null }); }
/** Decodes a stored declaration snapshot. @param value - JSONB snapshot. @returns Valid declaration. @throws {TaxReportingFailure} On malformed persistence. */
export function decodeDeclaration(value: unknown): VatDeclaration { return vatDeclaration(revive(value) as VatDeclaration); }
function revive(value: unknown): unknown { const json = JSON.stringify(value); if (json === undefined) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Stored reporting data is invalid."); return JSON.parse(json, (key, nested) => key === "minorAmount" && typeof nested === "string" && /^-?\d+$/.test(nested) ? BigInt(nested) : nested); }
function record(value: unknown): Record<string, unknown> { if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Reporting persistence returned an invalid result."); return value as Record<string, unknown>; }
function text(value: unknown): string { if (typeof value !== "string" || !value.trim()) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Reporting persistence omitted required data."); return value; }
function bool(value: unknown): boolean { if (typeof value !== "boolean") throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Reporting persistence omitted replay status."); return value; }
function integer(value: unknown): number { if (typeof value !== "number" || !Number.isInteger(value)) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Reporting persistence returned an invalid revision."); return value; }
function failure(message: string, databaseCode?: string): TaxReportingFailure {
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(databaseCode ?? "")) {
    return new TaxReportingFailure("TAX_REPORTING_UNAVAILABLE", "IVA reporting is not installed in the connected database environment.");
  }
  const code = /\b(TAX_REPORTING_[A-Z_]+)\b/.exec(message)?.[1];
  const known = new Set(["TAX_REPORTING_SCOPE", "TAX_REPORTING_IDEMPOTENCY_CONFLICT", "TAX_REPORTING_CONCURRENCY_CONFLICT", "TAX_REPORTING_DECLARATION_NOT_FOUND", "TAX_REPORTING_CORRECTION_SOURCE_INVALID", "TAX_REPORTING_CORRECTION_EXCEEDS_SOURCE", "TAX_REPORTING_PERIOD_CLOSED", "TAX_REPORTING_PERIOD_TRANSITION_INVALID"]);
  return new TaxReportingFailure(known.has(code ?? "") ? code as TaxReportingFailure["code"] : "TAX_REPORTING_INVALID", message);
}
function decodeLegacySource(value: unknown): LegacyVatSourceRecord { const row = record(value); const lines = row.lines; const documentDate = row.documentDate ?? row.document_date ?? row.date; const updatedAt = row.updatedAt ?? row.updated_at; const kind = row.kind ?? row.documentKind; const affectedId = row.affectedId ?? row.affected_id ?? null; const pendingReasons = row.pendingReasons ?? row.pending_reasons ?? []; if (typeof row.id !== "string" || typeof kind !== "string" || (documentDate !== null && typeof documentDate !== "string") || typeof updatedAt !== "string" || (affectedId !== null && typeof affectedId !== "string") || !Array.isArray(lines) || !Array.isArray(pendingReasons) || pendingReasons.some((reason) => typeof reason !== "string")) throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy VAT source document is invalid."); const header = row.header === undefined ? row : record(row.header); return { id: row.id, kind, affectedId, documentDate, updatedAt, pendingReasons: pendingReasons as string[], header: Object.fromEntries(Object.entries(header).filter(([key]) => key !== "lines" && key !== "pendingReasons" && key !== "pending_reasons").map(([key, nested]) => [key, nested === null ? null : typeof nested === "string" ? nested : null])), lines: lines.map((line) => { const item = record(line); return { rateCode: optionalText(item.rateCode ?? item.rate_code), base: optionalText(item.base), net: optionalText(item.net), included: item.included === null || item.included === undefined ? null : bool(item.included), taxAmount: optionalText(item.taxAmount ?? item.tax_amount ?? null), taxType: optionalText(item.taxType ?? item.tax_type ?? null), taxValue: optionalText(item.taxValue ?? item.tax_value ?? null), taxConcept: optionalText(item.taxConcept ?? item.tax_concept ?? null) }; }) }; }
function optionalText(value: unknown): string | null { return value === null ? null : text(value); }
function legacyCursor(value: string): { readonly date: string; readonly id: string } { try { const cursor = record(JSON.parse(value)); const date = text(cursor.date); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(); return { date, id: text(cursor.id) }; } catch { throw new TaxReportingFailure("TAX_REPORTING_INVALID", "Legacy VAT cursor is invalid."); } }
