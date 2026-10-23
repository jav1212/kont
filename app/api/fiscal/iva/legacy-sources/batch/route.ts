import { ReviewLegacyVatSourcesBatch } from "@kontave/tax-reporting/application";
import { SupabaseTaxReportingRepository } from "@kontave/tax-reporting/supabase";
import { TaxReportingFailure } from "@kontave/tax-reporting/domain";
import { requirePermission, resolveCanonicalTenantAuthorization, withTenant } from "@/src/shared/backend/utils/require-tenant";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { createSupabaseLegacyVatSourceReview } from "@kontave/tax-reporting/supabase";
import { parseCommand, reviewedAffectedFactId, stableFactId } from "../../record-legacy-source";
import { taxReportingFailureResponse } from "../../failure-response";
import type { LegacyVatReadDirection } from "@kontave/tax-reporting/application";

/** Reviews selected legacy sources and appends eligible facts in one transaction.
 * @param request - Direction, company, and up to one hundred fully reviewed sources.
 * @param tenant - Authenticated company operator.
 * @returns Per-source review result; ineligible sources remain untouched.
 */
export const POST = withTenant(async (request, tenant) => {
  let input: { readonly direction: LegacyVatReadDirection; readonly companyId: string; readonly commands: ReturnType<typeof parseCommand>[]; readonly idempotencyKey: string };
  try {
    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error();
    const data = body as Record<string, unknown>;
    const direction = data.direction;
    if (direction !== "purchase" && direction !== "sale") throw new Error();
    const companyId = typeof data.companyId === "string" ? data.companyId.trim() : "";
    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
    if (!companyId || companyId.length > 256 || !/^[A-Za-z0-9._:-]{8,100}$/.test(idempotencyKey) || !Array.isArray(data.items) || data.items.length < 1 || data.items.length > 100) throw new Error();
    const commands = data.items.map((item, index) => parseCommand(item, `${idempotencyKey}:${index}`, direction));
    if (commands.some((command) => command.companyId !== companyId)) throw new Error();
    input = { direction, companyId, commands, idempotencyKey };
  } catch {
    return Response.json({ error: "Selecciona hasta 100 fuentes e incluye la evidencia revisada de cada documento." }, { status: 400 });
  }

  await requirePermission(tenant, input.direction === "purchase" ? "purchases.confirm" : "sales.update", { req: request });
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization) return Response.json({ error: "Acceso denegado." }, { status: 403 });
  const client = new ServerSupabaseSource().instance;
  const { data: company, error: companyError } = await client.from("shared_companies").select("id").eq("tenant_id", tenant.tenantId).eq("organization_id", authorization.organizationId).eq("id", input.companyId).maybeSingle();
  if (companyError) return Response.json({ error: "No fue posible validar la empresa." }, { status: 503 });
  if (!company) return Response.json({ error: "Empresa no encontrada." }, { status: 404 });
  const scope = { tenantId: tenant.tenantId, organizationId: authorization.organizationId, companyId: input.companyId };
  const repository = new SupabaseTaxReportingRepository(client);
  const reviewer = createSupabaseLegacyVatSourceReview(client);
  try {
    const results = await new ReviewLegacyVatSourcesBatch(reviewer, repository).execute({
      scope, direction: input.direction, actorId: tenant.userId, idempotencyKey: input.idempotencyKey,
      items: input.commands.map((command) => ({
        sourceId: command.sourceId, from: command.from, to: command.to, ...(command.period ? { period: command.period } : {}),
        seed: { id: stableFactId(scope.tenantId, scope.organizationId, scope.companyId, input.direction, command.sourceId), scope, recognitionDate: command.recognitionDate, period: command.period ?? command.recognitionDate.slice(0, 7), affectedFactId: reviewedAffectedFactId(command, scope, input.direction), deductible: command.deductible, customsEvidence: null, recordedAt: command.recordedAt },
        evidence: command.evidence,
      })),
    });
    return Response.json({ data: results }, { status: results.replayed ? 200 : 201 });
  } catch (cause) {
    if (cause instanceof TaxReportingFailure) return taxReportingFailureResponse(cause);
    console.error("fiscal.iva.legacy_source.batch_failed", { companyId: input.companyId, direction: input.direction, cause });
    return Response.json({ error: "No fue posible completar la incorporación por lote." }, { status: 500 });
  }
}, { inferPermission: false, auditPermission: "companies.read" });
