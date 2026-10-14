import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import { ListVatDeclarationHistory, PrepareVatDeclaration } from "@kontave/tax-reporting/application";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { encode, SupabaseTaxReportingRepository } from "@kontave/tax-reporting/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermissions } from "@/src/shared/backend/utils/require-tenant";
import { taxReportingFailureResponse } from "../../failure-response";

/** Prepares an internal IVA declaration from all persisted facts in one month.
 * @param request - Company, period, reviewed carry-forward and adjustments, and stable idempotency key.
 * @param tenant - Authenticated member with both books' read access and purchase confirmation authority.
 * @returns The immutable prepared declaration or a typed authorization, validation, or persistence error.
 */
export const POST = withTenantPermissions(["purchases.read", "sales.read", "purchases.confirm"], async (request, tenant) => {
  let companyId: string;
  let period: string;
  let carryForwardText: string;
  let adjustmentsText: string;
  let declarationId: string;
  let expectedRevision: number | null;
  let createdAt: string;
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  try {
    const body = record(await request.json());
    companyId = requiredText(body.companyId, "companyId", 256);
    period = requiredText(body.period, "period", 7);
    carryForwardText = decimalText(body.carryForwardIn, "carryForwardIn");
    adjustmentsText = decimalText(body.adjustments, "adjustments");
    declarationId = requiredText(body.declarationId, "declarationId", 128);
    expectedRevision = body.expectedRevision === null ? null : body.expectedRevision as number;
    createdAt = requiredText(body.createdAt, "createdAt", 40);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("period must use YYYY-MM format.");
    if (expectedRevision !== null && (!Number.isInteger(expectedRevision) || expectedRevision < 1)) throw new Error("expectedRevision must be null or a positive integer.");
    if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) throw new Error("createdAt must be an ISO instant.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new Error("A stable Idempotency-Key header is required.");
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Invalid declaration request." }, { status: 400 });
  }

  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error: companyError } = await client.from("shared_companies")
    .select("id")
    .eq("tenant_id", tenant.tenantId)
    .eq("organization_id", authorization.organizationId)
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });

  try {
    const repository = new SupabaseTaxReportingRepository(client);
    const scope = { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId };
    const historyAction = new ListVatDeclarationHistory(repository);
    let historyCursor: { period: string; id: string; revision: number } | null = null;
    let latestDeclaration: Awaited<ReturnType<typeof historyAction.execute>>["items"][number] | null = null;
    let revisionCount = 0;
    do {
      const page = await historyAction.execute(scope, { fromPeriod: period, toPeriod: period, limit: 100, cursor: historyCursor }, tenant.userId);
      revisionCount += page.items.length;
      if (revisionCount > 10_000) return Response.json({ error: "El historial excede el límite de 10.000 revisiones para preparación." }, { status: 413 });
      if (page.items.length > 0) latestDeclaration = page.items[page.items.length - 1]!;
      historyCursor = page.nextCursor;
    } while (historyCursor !== null);

    if (latestDeclaration === null) {
      if (expectedRevision !== null) return Response.json({ error: "La revisión esperada ya no existe." }, { status: 409 });
    } else {
      const sameDeclaration = latestDeclaration.id === declarationId;
      const firstRevisionReplay = expectedRevision === null && latestDeclaration.revision === 1;
      const nextRevision = expectedRevision === latestDeclaration.revision;
      const previousCommandReplay = expectedRevision !== null && latestDeclaration.revision === expectedRevision + 1;
      if (latestDeclaration.status !== "prepared" || !sameDeclaration || !(firstRevisionReplay || nextRevision || previousCommandReplay)) {
        return Response.json({ error: "La declaración cambió o ya tiene evidencia externa; actualiza el historial antes de volver a preparar." }, { status: 409 });
      }
    }

    const from = `${period}-01`;
    const throughDate = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0));
    const to = throughDate.toISOString().slice(0, 10);
    const facts = [];
    let cursor: { recognitionDate: string; id: string } | null = null;
    do {
      const page = await repository.list(scope, { from, to, limit: 100, cursor }, tenant.userId);
      facts.push(...page.items);
      if (facts.length > 10_000) return Response.json({ error: "El período excede el límite de 10.000 hechos; divídelo antes de preparar el borrador." }, { status: 413 });
      cursor = page.nextCursor;
    } while (cursor !== null);

    const ves = currency("VES", 2);
    const action = new PrepareVatDeclaration(repository);
    const result = await action.execute({
      id: declarationId,
      scope,
      period,
      facts,
      template: { id: "kont-internal-vat-summary", version: "1", mapping: {} },
      carryForwardIn: moneyFromDecimal(carryForwardText, ves),
      adjustments: moneyFromDecimal(adjustmentsText, ves),
      actorId: tenant.userId,
      idempotencyKey,
      expectedRevision,
      createdAt,
    });
    return Response.json({ data: JSON.parse(encode(result)) }, { status: result.replayed ? 200 : 201 });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    console.error("fiscal.iva.declaration.prepare_failed", { companyId, period, cause });
    return Response.json({ error: "No fue posible preparar el borrador interno de IVA." }, { status: 500 });
  }
});

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("The JSON body must be an object.");
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${name} is required.`);
  return value.trim();
}

function decimalText(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length > 32 || !/^-?\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error(`${name} must be an exact decimal with at most two fractional digits.`);
  return value.trim();
}
