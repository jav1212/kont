import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AuthorizationDenied, AuthorizationSource, PERMISSIONS, permissionCode } from "@kontave/access-control/domain";
import { DelegatedAccessFailure, OrganizationAccessPathKind } from "@kontave/delegated-access/domain";
import { DelegatedPermissionScopePolicy } from "@kontave/workspace-context-application";
import type { PayablesWriteCommand } from "@kontave/payables/application";
import { PayablesFailure } from "@kontave/payables/domain";
import { organizationId, userId } from "@kontave/organizations/domain";
import { companyId } from "@kontave/companies/domain";
import { createSupabaseAuthorization } from "@kontave/access-control/supabase";
import { createOrganizationAccessActions } from "../organization-access/organization-access-actions";
import { authenticateClientRequest } from "../auth/auth-context";
import { apiError, apiSuccess } from "../http/response";
import { createPayablesActions } from "@/src/modules/payables/backend/payables-factory";
import { createPayablesIslrCalculator } from "./payables-islr";
import { createPayablesValuation } from "./payables-valuation";

type CommandPayload = { readonly organizationId: string; readonly companyId: string; readonly command: Record<string, unknown> };
// Document-creating commands are valued on the server; any client rate snapshot is discarded.
const permissions: Readonly<Record<string, string>> = {
  create_manual_document: PERMISSIONS.PAYABLES_CREATE,
  import_opening_document: PERMISSIONS.PAYABLES_CREATE,
  create_adjustment: PERMISSIONS.PAYABLES_ADJUST,
  apply_credit: PERMISSIONS.PAYABLES_ADJUST,
  reverse_credit_application: PERMISSIONS.PAYABLES_ADJUST,
  create_installment_plan: PERMISSIONS.PAYABLES_ADJUST,
  undo_installment_plan: PERMISSIONS.PAYABLES_ADJUST,
  change_due_date: PERMISSIONS.PAYABLES_ADJUST,
  create_payment_batch: PERMISSIONS.PAYABLES_CREATE,
  set_payment_batch_item: PERMISSIONS.PAYABLES_CREATE,
  submit_payment_batch: PERMISSIONS.PAYABLES_CREATE,
  authorize_payment_batch: PERMISSIONS.PAYABLES_AUTHORIZE,
  execute_supplier_payment: PERMISSIONS.PAYABLES_POST,
  execute_payment_batch: PERMISSIONS.PAYABLES_POST,
  void_supplier_payment: PERMISSIONS.PAYABLES_VOID,
  reverse_supplier_payment: PERMISSIONS.PAYABLES_REVERSE,
  configure_policy: PERMISSIONS.PAYABLES_AUTHORIZE,
  decide_adjustment: PERMISSIONS.PAYABLES_AUTHORIZE,
  mark_withholdings_declared: PERMISSIONS.PAYABLES_AUTHORIZE,
  // SQL additionally requires accounting.post for journal commands.
  post_payment_accounting: PERMISSIONS.PAYABLES_POST,
  reverse_payment_accounting: PERMISSIONS.PAYABLES_POST,
};

// Valuation failures already carry a Spanish, user-facing message and are passed through.
const failureMessages: Readonly<Partial<Record<PayablesFailure["code"], string>>> = {
  INVALID: "Los datos del movimiento no son válidos. Revisa importes, fechas y documentos.",
  NOT_FOUND: "El documento o proveedor ya no existe.",
  VERSION_CONFLICT: "El documento cambió mientras lo editabas. Recarga e inténtalo de nuevo.",
  IDEMPOTENCY_CONFLICT: "Esta operación ya se registró con otros datos.",
  CURRENCY_MISMATCH: "Los documentos deben estar en la misma moneda.",
  EXCEEDS_BALANCE: "El importe supera el saldo disponible (incluidas las reservas de lotes de pago).",
  SOURCE_ALREADY_REGISTERED: "Ese documento ya está registrado para el proveedor.",
  HAS_APPLICATIONS: "El documento tiene aplicaciones o reservas que lo impiden.",
  PERIOD_CLOSED: "La fecha pertenece a un período contable cerrado o sin período abierto.",
  WITHHOLDING_DUPLICATE: "El documento ya tiene una retención activa de ese impuesto.",
  WITHHOLDING_DECLARED: "La retención ya fue declarada; requiere un ajuste de retención, no una anulación.",
  APPROVAL_PENDING: "El ajuste espera la aprobación de otro usuario.",
  ACCOUNTING_RULES_MISSING: "No hay reglas contables activas de cuentas por pagar para este pago.",
};
const treasuryMessages: Readonly<Record<string, string>> = {
  TREASURY_INSUFFICIENT_FUNDS: "La caja o cuenta no tiene disponibilidad suficiente.",
  TREASURY_RECONCILED: "El movimiento ya está conciliado; solo puede reversarse.",
  TREASURY_TAX_POLICY_MISSING: "Configura la política de IDB/IGTF de la cuenta bancaria en Tesorería.",
  TREASURY_REJECTED: "Tesorería rechazó el desembolso: revisa la cuenta, la chequera y la moneda.",
};

/** Authenticates, scopes and executes one allowed Accounts Payable command.
 * @param request - JSON request containing organization, company and command facts, or only the command when the scope comes from the route.
 * @param routeScope - Organization and company from a client API route; the body then carries a scope-free command.
 * @returns A no-store command receipt or typed boundary error.
 * @throws Never; expected authorization and domain failures become HTTP responses.
 */
export async function executePayablesCommandRequest(request: Request, routeScope?: { readonly organizationId: string; readonly companyId: string }): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const identity = await authenticateClientRequest(request);
    if (!identity) return apiError("INVALID_ACCESS_TOKEN", "La sesión no es válida o expiró.", requestId, 401);
    const body: unknown = await request.json();
    const value: unknown = routeScope ? { ...routeScope, command: body } : body;
    if (!isPayload(value)) return apiError("PAYABLES_INVALID", "El comando de CxP no es válido.", requestId, 400);
    const org = organizationId(value.organizationId);
    const company = companyId(value.companyId);
    const permission = permissionCode(permissions[String(value.command.kind)] ?? "");
    const occurredAt = new Date().toISOString();
    const access = (await createOrganizationAccessActions().portfolio.execute(userId(identity.userId), occurredAt)).find((entry) => entry.organizationId === org);
    if (!access || !new DelegatedPermissionScopePolicy().permits(access.accessPath, permission)) return apiError("PAYABLES_FORBIDDEN", "No tienes permiso para operar estas cuentas por pagar.", requestId, 403);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRoleKey) throw new Error("Payables server infrastructure is not configured.");
    if (access.accessPath.kind === OrganizationAccessPathKind.DirectMembership) await createSupabaseAuthorization({ url, serviceRoleKey }).require.execute({
      actor: { userId: identity.userId, organizationId: org }, permission,
      resource: { type: "payables_command", organizationId: org, companyId: company },
      context: { requestId, source: AuthorizationSource.Web, occurredAt },
    });
    const { data: companyRow, error } = await createClient(url, serviceRoleKey, { auth: { persistSession: false } }).from("shared_companies").select("tenant_id").eq("organization_id", org).eq("id", company).maybeSingle();
    if (error || !companyRow?.tenant_id) return apiError("COMPANY_NOT_FOUND", "La empresa no existe o no está disponible.", requestId, 404);
    const scope = { tenantId: companyRow.tenant_id, organizationId: org, companyId: company, actorId: identity.userId };
    // The trusted scope always wins over any scope-like fields sent inside the command.
    const command = { ...value.command, ...scope } as unknown as PayablesWriteCommand;
    const result = await createPayablesActions(createPayablesValuation({ url, serviceRoleKey }, identity.userId), createPayablesIslrCalculator()).execute.execute(scope, command);
    return apiSuccess(result, requestId);
  } catch (cause) {
    if (cause instanceof PayablesFailure) {
      const status = cause.code === "FORBIDDEN" ? 403 : cause.code === "NOT_FOUND" ? 404 : ["VERSION_CONFLICT", "IDEMPOTENCY_CONFLICT", "HAS_APPLICATIONS", "SOURCE_ALREADY_REGISTERED", "WITHHOLDING_DUPLICATE", "WITHHOLDING_DECLARED", "APPROVAL_PENDING", "TREASURY_REJECTED"].includes(cause.code) ? 409 : cause.code === "UNAVAILABLE" ? 503 : 400;
      const code = status === 403 ? "PAYABLES_FORBIDDEN" : status === 404 ? "PAYABLES_NOT_FOUND" : status === 503 ? "PAYABLES_UNAVAILABLE" : status === 409 ? "PAYABLES_CONFLICT" : "PAYABLES_INVALID";
      const message = cause.code === "TREASURY_REJECTED" ? treasuryMessages[cause.message] ?? treasuryMessages.TREASURY_REJECTED : failureMessages[cause.code] ?? cause.message;
      return apiError(code, message ?? cause.message, requestId, status);
    }
    if (cause instanceof AuthorizationDenied || cause instanceof DelegatedAccessFailure) return apiError("PAYABLES_FORBIDDEN", "No tienes permiso para operar estas cuentas por pagar.", requestId, 403);
    console.error("client.payables.command.failed", { requestId, cause });
    return apiError("PAYABLES_UNAVAILABLE", "No se pudo procesar el comando de CxP.", requestId, 500);
  }
}

function isPayload(value: unknown): value is CommandPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  if (typeof payload.organizationId !== "string" || typeof payload.companyId !== "string" || !payload.command || typeof payload.command !== "object") return false;
  const command = payload.command as Record<string, unknown>;
  return typeof command.kind === "string" && command.kind in permissions && typeof command.idempotencyKey === "string" && command.idempotencyKey.length > 0 && typeof command.correlationId === "string" && command.correlationId.length > 0;
}
