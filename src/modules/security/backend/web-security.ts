import { createClient } from "@supabase/supabase-js";
import {
  CreateOrganizationalUser,
  ListOrganizationalUsers,
  RevokeOrganizationalUser,
  UpdateOrganizationalUser,
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations";
import {
  createOrganizationsDirectory,
  createSupabaseOrganizationalUserSecurity,
} from "@kontave/organizations/supabase";
import {
  AdministerAccountSecurity,
  ConfigureCredentialSecurityPolicy,
} from "@kontave/auth/application";
import {
  createSupabaseAccountSecurityRecovery,
  createSupabaseCredentialSecurityPolicyRepository,
} from "@kontave/auth/supabase";
import { SupabaseAuditTrailRepository } from "@kontave/audit-trail/adapters/supabase";
import {
  CancelPaymentOrderCommand,
  CreatePaymentOrderCommand,
  DeletePaymentOrderCommand,
  GetPaymentOrderQuery,
  UpdatePaymentOrderCommand,
} from "@kontave/payment-orders/application";
import { SupabasePaymentOrderRepository } from "@kontave/payment-orders/supabase";
import { createSupabaseScopedAccessGrants } from "@kontave/access-control/supabase";
import { ManageScopedAccessGrant } from "@kontave/access-control/application";
import {
  permissionCode,
  ScopedAccessTargetKind,
  type PermissionCode,
} from "@kontave/access-control/domain";
import {
  requireTenant,
  resolveCanonicalTenantAuthorization,
  TenantAuthError,
  TenantForbiddenError,
} from "@/src/shared/backend/utils/require-tenant";
import { z } from "zod";

/** Server-derived identity and organization bridge for a Web security request. */
export type SecurityWebScope = Readonly<{
  actorId: string;
  organizationId: string;
  tenantId: string;
}>;

/** Resolves scope only from the authenticated cookie session and canonical membership bridge. */
export async function requireSecurityWebScope(
  request: Request,
  options?: { readonly permission?: PermissionCode },
): Promise<SecurityWebScope> {
  const tenant = await requireTenant(request);
  const authorization = await resolveCanonicalTenantAuthorization(tenant);
  if (!authorization)
    throw new SecurityWebHttpError(403, "Sin acceso a la organización.");
  if (
    options?.permission &&
    !authorization.snapshot.role.hasPermission(options.permission)
  )
    throw new SecurityWebHttpError(403, "Permission denied.");
  return {
    actorId: tenant.userId,
    tenantId: tenant.tenantId,
    organizationId: authorization.organizationId,
  };
}

/** Creates server-only Supabase configuration. */
export function securitySupabaseConfiguration(): {
  readonly url: string;
  readonly serviceRoleKey: string;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new Error(
      "La configuración de seguridad del servidor no está disponible.",
    );
  return { url, serviceRoleKey };
}

/** Executes organizational-user use cases with a server-derived actor. */
export function organizationalUsers(scope: SecurityWebScope) {
  const configuration = securitySupabaseConfiguration();
  const persistence = createSupabaseOrganizationalUserSecurity(
    configuration,
    userId(scope.actorId),
  );
  const companies = createOrganizationsDirectory(configuration);
  return {
    list: () =>
      new ListOrganizationalUsers(
        persistence.repository,
        persistence.authorizer,
      ).execute({
        actorUserId: userId(scope.actorId),
        organizationId: organizationId(scope.organizationId),
      }),
    create: (input: {
      userId: string;
      displayName?: string | null;
      administrativePriority: number;
      allowedCompanyIds: readonly string[];
    }) =>
      new CreateOrganizationalUser(
        persistence.repository,
        persistence.identities,
        companies,
        persistence.authorizer,
      ).execute({
        actorUserId: userId(scope.actorId),
        organizationId: organizationId(scope.organizationId),
        userId: userId(input.userId),
        displayName: input.displayName,
        administrativePriority: input.administrativePriority,
        allowedCompanyIds: input.allowedCompanyIds.map(companyId),
      }),
    update: (
      targetUserId: string,
      input: {
        expectedVersion: number;
        changes: {
          displayName?: string | null;
          administrativePriority?: number;
          allowedCompanyIds?: readonly string[];
        };
      },
    ) =>
      new UpdateOrganizationalUser(
        persistence.repository,
        companies,
        persistence.authorizer,
      ).execute({
        actorUserId: userId(scope.actorId),
        organizationId: organizationId(scope.organizationId),
        userId: userId(targetUserId),
        expectedVersion: input.expectedVersion,
        changes: {
          ...(input.changes.displayName === undefined
            ? {}
            : { displayName: input.changes.displayName }),
          ...(input.changes.administrativePriority === undefined
            ? {}
            : { administrativePriority: input.changes.administrativePriority }),
          ...(input.changes.allowedCompanyIds === undefined
            ? {}
            : {
                allowedCompanyIds:
                  input.changes.allowedCompanyIds.map(companyId),
              }),
        },
      }),
    revoke: (targetUserId: string, expectedVersion: number) =>
      new RevokeOrganizationalUser(
        persistence.repository,
        persistence.authorizer,
      ).execute({
        actorUserId: userId(scope.actorId),
        organizationId: organizationId(scope.organizationId),
        userId: userId(targetUserId),
        expectedVersion,
      }),
  };
}

/** Reads or changes the credential policy and locks with service-only adapters. */
export function accountSecurity(scope: SecurityWebScope) {
  const config = securitySupabaseConfiguration();
  return {
    getPolicy: () =>
      createSupabaseCredentialSecurityPolicyRepository(config).get(
        scope.organizationId,
      ),
    updatePolicy: (input: {
      expectedVersion: number;
      policy: import("@kontave/auth/domain").CredentialSecurityPolicy;
    }) =>
      new ConfigureCredentialSecurityPolicy(
        createSupabaseCredentialSecurityPolicyRepository(config),
      ).execute({
        organizationId: scope.organizationId,
        policy: input.policy,
        version: input.expectedVersion,
        updatedAt: new Date().toISOString(),
        expectedVersion: input.expectedVersion,
        actorUserId: scope.actorId,
      }),
    unlock: (targetUserId: string) =>
      new AdministerAccountSecurity(
        createSupabaseAccountSecurityRecovery(config),
      ).unlock({
        organizationId: scope.organizationId,
        userId: targetUserId,
        actorUserId: scope.actorId,
      }),
  };
}

/** Reads audit facts only through the SQL authorization gate. */
export function auditTrail(scope: SecurityWebScope) {
  const config = securitySupabaseConfiguration();
  return new SupabaseAuditTrailRepository(
    createClient(config.url, config.serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }),
    scope.actorId,
  );
}

/** Executes payment-order application commands with authenticated scope. */
export function paymentOrders(scope: SecurityWebScope) {
  const config = securitySupabaseConfiguration();
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const repository = new SupabasePaymentOrderRepository(client);
  return {
    list: async (input: {
      companyId: string;
      offset: number;
      limit: number;
    }) => {
      const { data, error } = await client.rpc("list_payment_orders", {
        p_actor_id: scope.actorId,
        p_organization_id: scope.organizationId,
        p_company_id: input.companyId,
        p_offset: input.offset,
        p_limit: input.limit,
      });
      if (error)
        throw new SecurityWebHttpError(
          /ACCESS_DENIED|permission denied/i.test(error.message) ? 403 : 503,
          "No se pudieron consultar las órdenes de pago.",
        );
      return decodePaymentOrderPage(data, input);
    },
    create: (
      input: Omit<
        import("@kontave/payment-orders/application").CreatePaymentOrder,
        "actorId" | "organizationId"
      >,
    ) =>
      new CreatePaymentOrderCommand(repository).execute({
        ...input,
        actorId: scope.actorId,
        organizationId: scope.organizationId,
      }),
    update: (
      input: Omit<
        import("@kontave/payment-orders/application").UpdatePaymentOrder,
        "actorId" | "organizationId"
      >,
    ) =>
      new UpdatePaymentOrderCommand(repository).execute({
        ...input,
        actorId: scope.actorId,
        organizationId: scope.organizationId,
      }),
    get: (
      input: Omit<
        import("@kontave/payment-orders/application").GetPaymentOrder,
        "actorId" | "organizationId"
      >,
    ) =>
      new GetPaymentOrderQuery(repository).execute({
        ...input,
        actorId: scope.actorId,
        organizationId: scope.organizationId,
      }),
    cancel: (
      input: Omit<
        import("@kontave/payment-orders/application").VersionedPaymentOrder,
        "actorId" | "organizationId"
      >,
    ) =>
      new CancelPaymentOrderCommand(repository).execute({
        ...input,
        actorId: scope.actorId,
        organizationId: scope.organizationId,
      }),
    delete: (
      input: Omit<
        import("@kontave/payment-orders/application").VersionedPaymentOrder,
        "actorId" | "organizationId"
      >,
    ) =>
      new DeletePaymentOrderCommand(repository).execute({
        ...input,
        actorId: scope.actorId,
        organizationId: scope.organizationId,
      }),
  };
}

const paymentOrderPageSchema = z
  .object({
    orders: z.array(
      z
        .object({
          id: z.string().min(1),
          tenant_id: z.string().uuid(),
          organization_id: z.string().uuid(),
          company_id: z.string().min(1),
          beneficiary: z.string(),
          concept: z.string(),
          amount: z.string().regex(/^(?:0|[1-9]\d{0,19})(?:\.\d{1,8})?$/),
          currency: z.string().regex(/^[A-Z]{3}$/),
          due_date: z.string().date().nullable(),
          status: z.enum(["draft", "cancelled"]),
          version: z.number().int().positive(),
        })
        .strict(),
    ),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(100),
  })
  .strict();

/** Decodes a payment-order list only when the RPC preserved the requested page boundary. */
export function decodePaymentOrderPage(
  data: unknown,
  requested: { offset: number; limit: number },
) {
  const page = paymentOrderPageSchema.safeParse(data);
  if (!page.success)
    throw new SecurityWebHttpError(
      503,
      "La consulta de órdenes de pago devolvió datos inválidos.",
    );
  if (
    page.data.offset !== requested.offset ||
    page.data.limit !== requested.limit ||
    page.data.orders.length > requested.limit
  )
    throw new SecurityWebHttpError(
      503,
      "La consulta de órdenes de pago devolvió una página inválida.",
    );
  return {
    entries: page.data.orders.map((entry) => ({
      id: entry.id,
      tenantId: entry.tenant_id,
      organizationId: entry.organization_id,
      companyId: entry.company_id,
      beneficiary: entry.beneficiary,
      concept: entry.concept,
      amount: entry.amount,
      currency: entry.currency,
      dueDate: entry.due_date,
      status: entry.status,
      version: entry.version,
    })),
    total: page.data.total,
    offset: page.data.offset,
    limit: page.data.limit,
  };
}

/** Tests whether the actor has one exact grant without ever reading its underlying table. */
export async function hasScopedGrant(
  scope: SecurityWebScope,
  input: {
    permissionCode: string;
    target: { kind: string; id: string };
    companyId?: string;
  },
): Promise<boolean> {
  const permission = parseScopedPermission(input.permissionCode);
  const target = validatedScopedTarget(input.target.kind, input.target.id);
  return createSupabaseScopedAccessGrants(
    securitySupabaseConfiguration(),
  ).hasGrant({
    actor: { userId: scope.actorId, organizationId: scope.organizationId },
    permission,
    target,
    resource: {
      type: "security-administration",
      organizationId: scope.organizationId,
      ...(input.companyId ? { companyId: input.companyId } : {}),
    },
  });
}

/** Lists explicit grants for one membership through the dedicated authorization RPC. */
export async function listScopedGrants(
  scope: SecurityWebScope,
  membershipId: string,
) {
  const config = securitySupabaseConfiguration();
  const { data, error } = await createClient(
    config.url,
    config.serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  ).rpc("list_organization_scoped_grants", {
    p_organization_id: scope.organizationId,
    p_actor_user_id: scope.actorId,
    p_membership_id: membershipId,
  });
  if (error)
    throw new SecurityWebHttpError(
      /ACCESS_DENIED|permission denied/i.test(error.message) ? 403 : 503,
      "No se pudieron consultar los permisos específicos.",
    );
  const rows = scopedGrantListSchema.safeParse(data);
  if (
    !rows.success ||
    rows.data.some((row) => row.membershipId !== membershipId)
  )
    throw new SecurityWebHttpError(
      503,
      "La consulta de permisos específicos devolvió datos inválidos.",
    );
  return rows.data;
}

const scopedGrantListSchema = z.array(
  z
    .object({
      membershipId: z.string().uuid(),
      permissionCode: z
        .string()
        .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
      targetKind: z.string().min(1).max(80),
      targetId: z.string().min(1).max(160),
      companyId: z.string().min(1).max(128).nullable(),
    })
    .strict(),
);

/** Mutates a single exact grant with a separate administrator and subject membership. */
export async function mutateScopedGrant(
  scope: SecurityWebScope,
  input: {
    membershipId: string;
    permissionCode: string;
    target: { kind: string; id: string };
    companyId?: string;
    revoke?: boolean;
  },
): Promise<void> {
  const grants = createSupabaseScopedAccessGrants(
    securitySupabaseConfiguration(),
  );
  await new ManageScopedAccessGrant(grants).execute({
    administrator: {
      userId: scope.actorId,
      organizationId: scope.organizationId,
    },
    membershipId: input.membershipId,
    permission: input.permissionCode,
    target: validatedScopedTarget(input.target.kind, input.target.id),
    resource: {
      type: "security-administration",
      organizationId: scope.organizationId,
      ...(input.companyId ? { companyId: input.companyId } : {}),
    },
    action: input.revoke ? "revoke" : "grant",
  });
}

function parseScopedPermission(value: string) {
  try {
    return permissionCode(value);
  } catch {
    throw new SecurityWebHttpError(400, "El permiso indicado no existe.");
  }
}

function validatedScopedTarget(kind: string, id: string) {
  const targetKind = (Object.values(ScopedAccessTargetKind) as string[]).find(
    (candidate) => candidate === kind,
  ) as keyof typeof ScopedAccessTargetKind | undefined;
  if (!targetKind || typeof id !== "string" || !id.trim())
    throw new SecurityWebHttpError(400, "El recurso indicado no es valido.");
  return { kind: ScopedAccessTargetKind[targetKind], id: id.trim() };
}

/** Maps expected package failures to safe HTTP responses. */
export class SecurityWebHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Converts application failures without disclosing provider details. */
export function securityErrorResponse(error: unknown): Response {
  if (error instanceof SecurityWebHttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json(
      { error: "La solicitud no es válida." },
      { status: 400 },
    );
  if (error instanceof TenantAuthError)
    return Response.json({ error: "No autenticado." }, { status: 401 });
  if (error instanceof TenantForbiddenError)
    return Response.json(
      { error: "Sin acceso a la organización." },
      { status: 403 },
    );
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (/CONFLICT|VERSION/.test(code))
    return Response.json(
      { error: "El registro cambió en otro cliente." },
      { status: 409 },
    );
  if (/FORBIDDEN|DENIED|ACCESS|SCOPE/.test(code))
    return Response.json(
      { error: "No tienes permiso para realizar esta acción." },
      { status: 403 },
    );
  if (/INVALID|NOT_FOUND/.test(code))
    return Response.json(
      { error: "La solicitud no es válida." },
      { status: /NOT_FOUND/.test(code) ? 404 : 400 },
    );
  return Response.json(
    { error: "No se pudo completar la operación de seguridad." },
    { status: 500 },
  );
}

/** Decodes one JSON object and turns malformed client input into a 400 response. */
export async function securityJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new SecurityWebHttpError(400, "El cuerpo JSON no es válido.");
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new SecurityWebHttpError(400, "La solicitud no es válida.");
  return result.data;
}

/** Extracts an unambiguous route identifier. */
export function securityRouteId(value: string): string {
  const result = z.string().uuid().safeParse(value);
  if (!result.success)
    throw new SecurityWebHttpError(400, "El identificador no es válido.");
  return result.data;
}
