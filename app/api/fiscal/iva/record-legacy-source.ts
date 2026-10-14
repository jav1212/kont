import { createHash } from "node:crypto";
import { currency, moneyFromDecimal, type CurrencyDefinition } from "@kontave/monetary/domain";
import { createSupabaseLegacyVatSourceReview, encode } from "@kontave/tax-reporting/supabase";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import type { LegacyVatReadDirection, LegacyVatRecordReviewEvidence, LegacyVatReviewedRate } from "@kontave/tax-reporting/application";
import { taxReportingFailureResponse } from "./failure-response";
import { resolveCanonicalTenantAuthorization, type TenantContext } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/** Records one manually reviewed legacy VAT source as an immutable reporting fact.
 * @param request - Review evidence and a stable `Idempotency-Key` header.
 * @param tenant - Authenticated reviewer context supplied by the route authorization wrapper.
 * @param direction - Book direction that determines the required permission and source query.
 * @returns A serialized fact or a stable validation, scope, conflict, or unavailable response.
 */
export async function recordLegacyVatSource(request: Request, tenant: TenantContext, direction: LegacyVatReadDirection): Promise<Response> {
  let command: ReviewCommand;
  try {
    command = parseCommand(await request.json(), request.headers.get("Idempotency-Key"), direction);
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    return Response.json({ error: "El cuerpo JSON de revisión no es válido." }, { status: 400 });
  }

  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error: companyError } = await client.from("shared_companies")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("organization_id", authorization.organizationId)
    .eq("id", command.companyId)
    .maybeSingle();
  if (companyError) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const scope = { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId: command.companyId };
    const seed = {
      id: stableFactId(scope.tenantId, scope.organizationId, scope.companyId, direction, command.sourceId),
      scope,
      recognitionDate: command.recognitionDate,
      period: command.recognitionDate.slice(0, 7),
      affectedFactId: command.affectedFactId,
      deductible: command.deductible,
      customsEvidence: null,
      recordedAt: command.recordedAt,
    };
    const result = await createSupabaseLegacyVatSourceReview(client).execute({
      scope,
      direction,
      sourceId: command.sourceId,
      from: command.from,
      to: command.to,
      seed,
      evidence: command.evidence,
      actorId: tenant.userId,
      idempotencyKey: command.idempotencyKey,
    });
    return Response.json({ data: JSON.parse(encode(result)) }, { status: result.replayed ? 200 : 201 });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    console.error("fiscal.iva.legacy_source.review_failed", { direction, cause });
    return Response.json({ error: "No fue posible guardar la revisión IVA." }, { status: 500 });
  }
}

interface ReviewCommand {
  readonly companyId: string;
  readonly sourceId: string;
  readonly from: string;
  readonly to: string;
  readonly recognitionDate: string;
  readonly affectedFactId: string | null;
  readonly deductible: { readonly state: "eligible" | "ineligible" | "pending_review"; readonly amount: ReturnType<typeof moneyFromDecimal>; readonly reason: string | null };
  readonly evidence: LegacyVatRecordReviewEvidence;
  readonly recordedAt: string;
  readonly idempotencyKey: string;
}

function parseCommand(value: unknown, idempotencyHeader: string | null, direction: LegacyVatReadDirection): ReviewCommand {
  const body = object(value);
  const companyId = text(body.companyId, "companyId", 256);
  const sourceId = text(body.sourceId, "sourceId", 220);
  const from = date(body.from, "from");
  const to = date(body.to, "to");
  const recognitionDate = date(body.recognitionDate, "recognitionDate");
  const recordedAt = instant(body.recordedAt, "recordedAt");
  const idempotencyKey = text(idempotencyHeader, "Idempotency-Key", 128);
  if (idempotencyKey.length < 8 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) invalid("Idempotency-Key must be stable and contain 8 to 128 safe characters.");
  if (from > to || recognitionDate < from || recognitionDate > to) invalid("Recognition date must belong to the reviewed source range.");

  const currencyInput = object(body.currency);
  const currencyCode = text(currencyInput.code, "currency.code", 3).toUpperCase();
  const minorUnit = integer(currencyInput.minorUnit, "currency.minorUnit", 0, 6);
  let definition: CurrencyDefinition;
  try { definition = currency(currencyCode, minorUnit); } catch { invalid("Reviewed currency definition is invalid."); }
  const amount = (raw: unknown, name: string) => {
    const decimal = text(raw, name, 64);
    try { return moneyFromDecimal(decimal, definition); } catch { invalid(`${name} must be an exact decimal amount.`); }
  };

  const rawRates = body.rates;
  if (!Array.isArray(rawRates) || rawRates.length < 1 || rawRates.length > 12) invalid("One to twelve reviewed historical rate groups are required.");
  const rates: LegacyVatReviewedRate[] = rawRates.map((raw, index) => {
    const rate = object(raw);
    const category = text(rate.category, `rates[${index}].category`, 32);
    if (!["taxable", "zero_rated", "exempt", "exonerated", "non_subject", "unknown"].includes(category)) invalid(`rates[${index}].category is unsupported.`);
    const ruleVersion = rate.ruleVersion === null ? null : text(rate.ruleVersion, `rates[${index}].ruleVersion`, 128);
    return {
      rate: text(rate.rate, `rates[${index}].rate`, 32),
      category: category as LegacyVatReviewedRate["category"],
      taxableBase: amount(rate.taxableBase, `rates[${index}].taxableBase`),
      taxAmount: amount(rate.taxAmount, `rates[${index}].taxAmount`),
      ruleVersion,
    };
  });

  const deductible = direction === "purchase" ? parseDeductible(body.deductible, amount) : {
    state: "ineligible" as const,
    amount: amount("0", "deductible.amount"),
    reason: "Las ventas no generan crédito fiscal deducible de compras.",
  };
  const exemptBase = amount(body.exemptBase, "exemptBase");
  const historicalExemptBase = body.historicalExemptBase === null ? null : amount(body.historicalExemptBase, "historicalExemptBase");
  const withholdingOccurredAt = body.withholdingOccurredAt === null ? null : instant(body.withholdingOccurredAt, "withholdingOccurredAt");
  return {
    companyId,
    sourceId,
    from,
    to,
    recognitionDate,
    recordedAt,
    idempotencyKey,
    affectedFactId: optionalText(body.affectedFactId, "affectedFactId", 256),
    deductible,
    evidence: { currency: definition, exemptBase, historicalExemptBase, rates, withholdingOccurredAt },
  };
}

function parseDeductible(
  value: unknown,
  amount: (raw: unknown, label: string) => ReturnType<typeof moneyFromDecimal>,
): ReviewCommand["deductible"] {
  const input = object(value);
  const state = text(input.state, "deductible.state", 32);
  if (!["eligible", "ineligible", "pending_review"].includes(state)) invalid("deductible.state is unsupported.");
  return {
    state: state as ReviewCommand["deductible"]["state"],
    amount: amount(input.amount, "deductible.amount"),
    reason: optionalText(input.reason, "deductible.reason", 500),
  };
}

function stableFactId(tenantId: string, organizationId: string, companyId: string, direction: LegacyVatReadDirection, sourceId: string): string {
  const digest = createHash("sha256").update([tenantId, organizationId, companyId, direction, sourceId].join("\u001f")).digest("hex");
  return `legacy-review:${digest}`;
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("Review evidence must be a JSON object.");
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) invalid(`${label} is required and has an invalid length.`);
  return value.trim();
}

function optionalText(value: unknown, label: string, max: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, label, max);
}

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) invalid(`${label} is invalid.`);
  return value;
}

function date(value: unknown, label: string): string {
  const result = text(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) invalid(`${label} must be an ISO calendar date.`);
  const parsed = new Date(`${result}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) invalid(`${label} must be a real calendar date.`);
  return result;
}

function instant(value: unknown, label: string): string {
  const result = text(value, label, 40);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(result) || !Number.isFinite(Date.parse(result))) invalid(`${label} must be an ISO timestamp with a timezone.`);
  return result;
}

function invalid(message: string): never { throw new TaxReportingFailure("TAX_REPORTING_INVALID", message); }
