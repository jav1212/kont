import { currency, moneyFromDecimal } from "@kontave/monetary/domain";
import { ChangeVatDeclarationLifecycle, ListVatDeclarationHistory, type ChangeVatDeclarationLifecycleCommand } from "@kontave/tax-reporting/application";
import { TaxReportingFailure, type VatDeclaration } from "@kontave/tax-reporting/domain";
import { encode, SupabaseTaxReportingRepository } from "@kontave/tax-reporting/supabase";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { resolveCanonicalTenantAuthorization, withTenantPermissions } from "@/src/shared/backend/utils/require-tenant";
import { taxReportingFailureResponse } from "../../../failure-response";

/** Appends externally evidenced submission/payment or an internal void revision.
 * @param request - Action evidence, expected revision, and stable idempotency header.
 * @param tenant - Authenticated actor with both book reads and IVA lifecycle update permissions.
 * @returns The stored lifecycle revision, an exact evidenced replay, or a typed error.
 */
export const POST = withTenantPermissions(["purchases.read", "sales.read", "purchases.confirm", "sales.update"], async (request, tenant) => {
  const path = new URL(request.url).pathname;
  const match = path.match(/\/declarations\/([^/]+)\/lifecycle\/?$/);
  const declarationId = match ? decodeURIComponent(match[1]!).trim() : "";
  if (!declarationId || declarationId.length > 128) return Response.json({ error: "Identificador de declaración inválido." }, { status: 400 });

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  let companyId: string;
  let period: string;
  let expectedRevision: number;
  let command: ChangeVatDeclarationLifecycleCommand;
  try {
    const body = record(await request.json());
    companyId = requiredText(body.companyId, "companyId", 256);
    period = requiredText(body.period, "period", 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("period must use YYYY-MM format.");
    expectedRevision = body.expectedRevision as number;
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error("expectedRevision must be a positive integer.");
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new Error("A stable Idempotency-Key header is required.");
    command = parseCommand(body, tenant.userId);
  } catch (cause) {
    return Response.json({ error: cause instanceof Error ? cause.message : "Solicitud de ciclo de IVA inválida." }, { status: 400 });
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
    const history = new ListVatDeclarationHistory(repository);
    let declaration: VatDeclaration | null = null;
    let cursor: { period: string; id: string; revision: number } | null = null;
    let visited = 0;
    do {
      const page = await history.execute(scope, { fromPeriod: period, toPeriod: period, limit: 100, cursor }, tenant.userId);
      visited += page.items.length;
      if (visited > 10_000) return Response.json({ error: "El historial supera el límite de búsqueda de 10.000 revisiones." }, { status: 413 });
      for (const item of page.items) if (item.id === declarationId && (declaration === null || item.revision > declaration.revision)) declaration = item;
      cursor = page.nextCursor;
    } while (cursor !== null);
    if (!declaration) return Response.json({ error: "Declaración no encontrada." }, { status: 404 });

    if (declaration.revision >= expectedRevision + 1 && evidenceAlreadyRecorded(declaration, command)) {
      return Response.json({ data: JSON.parse(encode({ declaration, replayed: true })) }, { status: 200 });
    }
    if (declaration.revision !== expectedRevision) return Response.json({ error: "La declaración cambió; actualiza el historial antes de registrar evidencia." }, { status: 409 });

    const action = new ChangeVatDeclarationLifecycle(repository);
    const result = await action.execute({ declaration, command, actorId: tenant.userId, idempotencyKey, expectedRevision });
    return Response.json({ data: JSON.parse(encode(result)) }, { status: result.replayed ? 200 : 201 });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    console.error("fiscal.iva.declaration.lifecycle_failed", { declarationId, companyId, cause });
    return Response.json({ error: "No fue posible guardar la evidencia de ciclo de la declaración." }, { status: 500 });
  }
});

function parseCommand(body: Record<string, unknown>, actorId: string): ChangeVatDeclarationLifecycleCommand {
  const evidence = record(body.evidence);
  if (body.action === "submit") return { kind: "submit", evidence: { reference: requiredText(evidence.reference, "reference", 256), submittedAt: requiredInstant(evidence.submittedAt, "submittedAt") } };
  if (body.action === "record_payment") return { kind: "record_payment", evidence: {
    reference: requiredText(evidence.reference, "reference", 256),
    amount: moneyFromDecimal(requiredText(evidence.amount, "amount", 32), currency("VES", 2)),
    paidAt: requiredInstant(evidence.paidAt, "paidAt"),
  } };
  if (body.action === "void") return { kind: "void", evidence: { reason: requiredText(evidence.reason, "reason", 256), voidedAt: new Date().toISOString(), actorId } };
  throw new Error("action must be submit, record_payment, or void.");
}

function evidenceAlreadyRecorded(declaration: VatDeclaration, command: ChangeVatDeclarationLifecycleCommand): boolean {
  if (command.kind === "submit") return declaration.submittedEvidence?.reference === command.evidence.reference && declaration.submittedEvidence.submittedAt === command.evidence.submittedAt;
  if (command.kind === "record_payment") return declaration.payments.some((payment) => payment.reference === command.evidence.reference
    && payment.amount.minorAmount === command.evidence.amount.minorAmount && payment.paidAt === command.evidence.paidAt);
  return declaration.status === "void" && declaration.voidEvidence?.reason === command.evidence.reason && declaration.voidEvidence.actorId === command.evidence.actorId;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("The JSON value must be an object.");
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new Error(`${name} is required.`);
  return value.trim();
}

function requiredInstant(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`${name} must be an ISO instant.`);
  return value;
}
