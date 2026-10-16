import { AuthorizationDenied, permissionCode, PERMISSIONS } from "@kontave/access-control/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { companyId as organizationCompanyId } from "@kontave/companies/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { PostgresTreasuryRepository } from "@kontave/treasury/postgres";
import { ExecuteTreasuryCommand, ExecuteTreasuryQuery, RecordCheckDeliveriesBatch, type RecordCheckDeliveryCommand, type TreasuryQuery, type TreasuryWriteCommand } from "@kontave/treasury/application";
import type { TreasuryCommandRequest, TreasuryQueryRequest } from "@kontave/treasury/contracts";
import { TreasuryFailure as TreasuryOperationFailure } from "@kontave/treasury/domain";
import { DelegatedAccessFailure, OrganizationAccessPathKind } from "@kontave/delegated-access/domain";
import { DelegatedPermissionScopePolicy } from "@kontave/workspace-context-application";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";
import { withWebAuditContext } from "@/src/modules/security/backend/web-audit-context";
import { authenticateClientRequest } from "../auth/auth-context";
import { createCompanyActions } from "../companies/company-actions";
import { createOrganizationAccessActions } from "../organization-access/organization-access-actions";
import { clientSource } from "../http/client-source";
import { apiError, apiSuccess } from "../http/response";
import { createTreasuryMoneyFactory, treasuryCurrencyMinorUnit } from "./treasury-money-factory";
import { treasuryCommandPermission } from "./treasury-command-permission";

const trustedScopeKeys = new Set(["actorId", "tenantId", "organizationId", "companyId"]);
const checkDeliveryBatchFields = new Set(["deliveryEventId", "checkId", "recipientName", "deliveredAt", "evidenceReference", "expectedVersion", "idempotencyKey", "correlationId"]);

/**
 * Handles a transport-safe Treasury request after deriving financial scope from authenticated server state.
 * @param request - Client request carrying only the portable command or query payload.
 * @param rawOrganizationId - Organization selected by the authenticated route.
 * @param rawCompanyId - Operational company selected by the authenticated route.
 * @param operation - Whether the payload is a command or read query.
 * @returns A no-store API response containing the durable result or stable query page.
 * @throws Returns a typed API error response when authorization, validation, or persistence fails.
 */
export async function executeTreasuryRequest(
  request: Request,
  rawOrganizationId: string,
  rawCompanyId: string,
  operation: "commands" | "query",
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity) return apiError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);

    const orgId = organizationId(rawOrganizationId);
    const company = organizationCompanyId(rawCompanyId);
    const occurredAt = new Date().toISOString();
    const access = (await createOrganizationAccessActions().portfolio.execute(userId(identity.userId), occurredAt))
      .find((item) => item.organizationId === orgId);
    if (!access) {
      return apiError("TREASURY_ACCESS_DENIED", "No tienes acceso a tesorería para esta empresa.", requestId, 403);
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new Error("Treasury server infrastructure is not configured.");
    await createCompanyActions().getOperational.execute(orgId, company);
    const server = new ServerSupabaseSource();
    const organization = await server.instance.from("organizations").select("legacy_tenant_id").eq("id", orgId).maybeSingle();
    if (organization.error) throw organization.error;
    const tenantId = organization.data?.legacy_tenant_id;
    if (!tenantId) return apiError("ORGANIZATION_NOT_FOUND", "La organización no tiene una empresa operativa asociada.", requestId, 404);

    const scope = { actorId: identity.userId, tenantId, organizationId: orgId, companyId: company };
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError("TREASURY_INVALID", "El cuerpo JSON de tesorería no es válido.", requestId, 400);
    }
    if (!isRecord(body) || Object.keys(body).some((key) => trustedScopeKeys.has(key))) {
      return apiError("TREASURY_INVALID", "La solicitud de tesorería no es válida.", requestId, 400);
    }
    const requiredPermission = operation === "query" ? PERMISSIONS.TREASURY_READ : treasuryCommandPermission(body.kind);
    if (!requiredPermission) return apiError("TREASURY_INVALID", "El comando de tesorería no está soportado.", requestId, 400);
    const commandPermission = permissionCode(requiredPermission);
    if (!new DelegatedPermissionScopePolicy().permits(access.accessPath, commandPermission)) {
      return apiError("TREASURY_ACCESS_DENIED", "No tienes permiso para ejecutar esta operación de tesorería.", requestId, 403);
    }
    if (access.accessPath.kind === OrganizationAccessPathKind.DirectMembership) {
      await createSupabaseAuthorization({ url, serviceRoleKey }).require.execute({
        actor: { userId: identity.userId, organizationId: orgId }, permission: commandPermission,
        resource: { type: "treasury", organizationId: orgId, companyId: company },
        context: { requestId, source: clientSource(request.headers.get("x-kontave-client")), occurredAt },
      });
    }
    const normalizedBody = operation === "commands"
      ? await resolveTreasuryMoneySnapshots(body, { ...scope, actorId: identity.userId }, { url, serviceRoleKey })
      : body;
    const repository = new PostgresTreasuryRepository({
      call: async (functionName, argumentsValue) => {
        const result = await server.instance.rpc(functionName, argumentsValue);
        if (result.error) throw result.error;
        return result.data;
      },
    });
    if (operation === "commands" && body.kind === "record_check_deliveries_batch") {
      if (Object.keys(body).some((key) => key !== "kind" && key !== "commands") || !Array.isArray(body.commands)) {
        return apiError("TREASURY_INVALID", "El lote de entrega de cheques no es válido.", requestId, 400);
      }
      const commands: RecordCheckDeliveryCommand[] = body.commands.map((item) => {
        if (!isRecord(item) || Object.keys(item).some((key) => !checkDeliveryBatchFields.has(key))) {
          throw new TreasuryOperationFailure("INVALID", "Cada elemento del lote debe contener únicamente sus datos de entrega.");
        }
        const { deliveryEventId, checkId, recipientName, deliveredAt, evidenceReference, expectedVersion, idempotencyKey, correlationId } = item;
        if ([deliveryEventId, checkId, recipientName, deliveredAt, idempotencyKey, correlationId].some((value) => typeof value !== "string")
          || !Number.isSafeInteger(expectedVersion)
          || (evidenceReference !== undefined && typeof evidenceReference !== "string")) {
          throw new TreasuryOperationFailure("INVALID", "Cada entrega debe incluir sus identificadores, destinatario, fecha y versión.");
        }
        return {
          ...scope,
          kind: "record_check_delivery",
          deliveryEventId: deliveryEventId as string,
          checkId: checkId as string,
          recipientName: recipientName as string,
          deliveredAt: deliveredAt as string,
          ...(evidenceReference === undefined ? {} : { evidenceReference: evidenceReference as string }),
          expectedVersion: expectedVersion as number,
          idempotencyKey: idempotencyKey as string,
          correlationId: correlationId as string,
        };
      });
      const outcomes = await withWebAuditContext<unknown>(
        { actorId: identity.userId, tenantId, permission: commandPermission, deviceId: request.headers.get("x-kontave-device-name") ?? undefined },
        () => new RecordCheckDeliveriesBatch(new ExecuteTreasuryCommand(repository)).execute(commands),
      );
      return apiSuccess(outcomes, requestId);
    }
    const result = await withWebAuditContext<unknown>(
      { actorId: identity.userId, tenantId, permission: commandPermission, deviceId: request.headers.get("x-kontave-device-name") ?? undefined },
      async () => {
        if (operation === "commands") return new ExecuteTreasuryCommand(repository).execute({ ...normalizedBody, ...scope } as TreasuryCommandRequest & typeof scope as TreasuryWriteCommand);
        return new ExecuteTreasuryQuery(repository).execute({ ...normalizedBody, ...scope } as TreasuryQueryRequest & typeof scope as TreasuryQuery);
      },
    );
    return apiSuccess(result, requestId);
  } catch (cause) {
    if (cause instanceof AuthorizationDenied || cause instanceof DelegatedAccessFailure)
      return apiError("TREASURY_ACCESS_DENIED", "No tienes acceso a tesorería para esta empresa.", requestId, 403);
    if (cause instanceof TreasuryOperationFailure) {
      const status = cause.code === "INVALID" ? 400 : cause.code === "NOT_FOUND" ? 404
        : cause.code === "FORBIDDEN" ? 403 : cause.code === "UNAVAILABLE" ? 503 : 409;
      return apiError(`TREASURY_${cause.code}` as Parameters<typeof apiError>[0], cause.message, requestId, status);
    }
    console.error("client.treasury.failed", { requestId, cause });
    return apiError("INTERNAL_ERROR", "No se pudo procesar la solicitud de tesorería.", requestId, 500);
  }
}

/** Replaces client-supplied monetary valuations with snapshots derived from company policy and official rates.
 * @param body - Strictly scoped command payload received from the client.
 * @param scope - Authenticated tenant, organization, company and actor scope.
 * @param configuration - Trusted Supabase service-role configuration.
 * @returns A command payload containing only server-derived monetary snapshots.
 * @throws {TreasuryOperationFailure} When monetary input or company valuation evidence is invalid/unavailable.
 */
async function resolveTreasuryMoneySnapshots(
  body: Record<string, unknown>,
  scope: { readonly tenantId: string; readonly organizationId: string; readonly companyId: string; readonly actorId: string },
  configuration: { readonly url: string; readonly serviceRoleKey: string },
): Promise<Record<string, unknown>> {
  const commandBody = { ...body };
  if (!Object.prototype.hasOwnProperty.call(body, "money") && !Array.isArray(body.collectionAllocations) && !Array.isArray(body.lines)) return commandBody;
  const moneyFactory = createTreasuryMoneyFactory(configuration, scope.actorId);
  const resolve = async (value: unknown, asOf: unknown): Promise<unknown> => {
    if (!isRecord(value) || typeof value.amount !== "string" || typeof value.currency !== "string" || typeof asOf !== "string") {
      throw new TreasuryOperationFailure("INVALID", "El movimiento requiere importe, moneda y fecha para calcular su valuación en el servidor.");
    }
    return moneyFactory.execute({ organizationId: scope.organizationId, companyId: scope.companyId, amount: value.amount, currency: value.currency, minorUnit: treasuryCurrencyMinorUnit(value.currency), asOf });
  };
  if (Object.prototype.hasOwnProperty.call(body, "money")) {
    const valuationDate = body.operationalDate ?? body.issueDate ?? body.depositDate;
    commandBody.money = await resolve(body.money, valuationDate);
  }
  if (Array.isArray(body.collectionAllocations)) {
    commandBody.collectionAllocations = await Promise.all(body.collectionAllocations.map(async (value) => {
      if (!isRecord(value)) throw new TreasuryOperationFailure("INVALID", "La asignación de cobranzas del depósito es inválida.");
      return { ...value, amount: await resolve(value.amount, body.depositDate) };
    }));
  }
  if (Array.isArray(body.lines)) {
    commandBody.lines = await Promise.all(body.lines.map(async (value) => {
      if (!isRecord(value)) throw new TreasuryOperationFailure("INVALID", "Una línea del extracto bancario es inválida.");
      return { ...value, money: await resolve(value.money, value.valueDate) };
    }));
  }
  return commandBody;
}

/** Narrows JSON objects before scope is added from trusted server state. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
