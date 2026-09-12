import { z } from "zod";
import type { AvailableOrganizationModule } from "@kontave/modules/application";
import { moduleId, type ModuleCode } from "@kontave/modules/domain";
import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import { OrganizationAccessPathKind } from "@kontave/delegated-access/domain";
import type { WorkspacePortfolioEntry } from "@kontave/workspace-context-application";
import {
  workspaceSchema,
  type OrganizationWorkspace,
} from "../../organizations/contracts";
import type { Company } from "../../companies/frontend/hooks/use-companies";
import type { TenantEntry } from "../../memberships/frontend/hooks/use-active-tenant";
import { APP_MODULES } from "@/src/shared/frontend/navigation";
import {
  getModuleVisibilityPermission,
  hasOrganizationPermission,
} from "../../organizations/frontend/module-access-policy";

export interface WebSubscription {
  readonly id: string;
  readonly status: string;
  readonly product: { readonly slug: string } | null;
}

export interface WebWorkspaceDirectory {
  readonly organizations: readonly OrganizationWorkspace[];
  readonly tenants: readonly TenantEntry[];
}

export interface WebWorkspaceSource {
  /** Loads the authenticated Web directory without trusting remembered scope.
   * @param signal - Cancels an obsolete session or selection.
   * @returns Authorized organization and legacy membership projections.
   * @throws Error when the directory cannot be verified.
   */
  directory(signal: AbortSignal): Promise<WebWorkspaceDirectory>;
  /** Loads operational companies using the candidate's explicit tenant header.
   * @param organization - Authorized candidate organization.
   * @param signal - Cancels an obsolete selection.
   * @returns Companies owned by this candidate.
   * @throws Error when loading or ownership validation fails.
   */
  companies(
    organization: OrganizationWorkspace,
    signal: AbortSignal,
  ): Promise<readonly Company[]>;
  /** Loads the existing Web subscription projection.
   * @param organization - Authorized candidate organization.
   * @param signal - Cancels an obsolete selection.
   * @returns Subscriptions; authorization remains separate from entitlement.
   * @throws Error when the subscription source cannot be verified.
   */
  subscriptions(
    organization: OrganizationWorkspace,
    signal: AbortSignal,
  ): Promise<readonly WebSubscription[]>;
}

const tenantSchema = z.object({
  tenantId: z.string(),
  role: z.enum([
    "owner",
    "admin",
    "contador",
    "contable",
    "vendedor",
    "cajero",
  ]),
  tenantEmail: z.string(),
  tenantAvatarUrl: z.string().nullable(),
  isOwn: z.boolean(),
  permissions: z.array(z.string()),
});
const companySchema = z
  .object({ id: z.string().min(1), ownerId: z.string(), name: z.string() })
  .passthrough();
const subscriptionSchema = z.object({
  id: z.string(),
  status: z.string(),
  product: z.object({ slug: z.string() }).nullable(),
});

/** Creates Web compatibility sources over cookie-authenticated APIs.
 * @param request - Browser fetch or a deterministic test transport.
 * @returns Scoped sources without shared mutable selection or cache state.
 */
export function createWebWorkspaceSource(
  request: typeof fetch = fetch,
): WebWorkspaceSource {
  async function read<T>(
    path: string,
    schema: z.ZodType<T>,
    signal: AbortSignal,
    tenant?: string,
  ): Promise<T> {
    const response = await request(path, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      cache: "no-store",
      headers: tenant ? { "X-Tenant-Id": tenant } : undefined,
    });
    const payload: unknown = await response.json();
    if (!response.ok)
      throw new Error(
        "No se pudo cargar el espacio de trabajo. Vuelve a intentarlo.",
      );
    return z.object({ data: schema }).parse(payload).data;
  }
  return {
    async directory(signal) {
      const [organizations, tenants] = await Promise.all([
        read("/api/organizations", workspaceSchema.array(), signal),
        read("/api/memberships", tenantSchema.array(), signal),
      ]);
      return { organizations, tenants };
    },
    async companies(organization, signal) {
      // A role without company access can still use its permitted personal pages.
      if (
        !hasOrganizationPermission(organization.permissions, "companies.read")
      )
        return [];
      const companies = await read(
        "/api/companies/get-by-owner",
        companySchema.array(),
        signal,
        organization.legacyTenantId,
      );
      if (
        companies.some(
          (company) => company.ownerId !== organization.legacyTenantId,
        )
      )
        throw new Error("No se pudo validar la pertenencia de las empresas.");
      return companies as Company[];
    },
    subscriptions: (organization, signal) =>
      read(
        "/api/billing/subscriptions",
        subscriptionSchema.array(),
        signal,
        organization.legacyTenantId,
      ),
  };
}

/** Adapts an authorized Web organization to the portable workspace portfolio.
 * @param organization - Organization admitted by the cookie API.
 * @param actorId - Current authenticated user.
 * @returns A direct-access portfolio entry; no delegated access is inferred.
 */
export function webPortfolioEntry(
  organization: OrganizationWorkspace,
  actorId: string,
): WorkspacePortfolioEntry {
  const id = organizationId(organization.id);
  return {
    organizationId: id,
    name: organization.name,
    avatarUrl: organization.avatarUrl ?? organization.logoUrl,
    relationship: organization.role === "owner" ? "personal" : "member",
    accessPath: {
      kind: OrganizationAccessPathKind.DirectMembership,
      actorUserId: userId(actorId),
      actingOrganizationId: id,
      targetOrganizationId: id,
      delegationId: null,
      scopes: [],
    },
  };
}

/** Resolves Web modules using the existing navigation, permission and subscription policy.
 * @param organization - Selected organization's canonical permissions.
 * @param subscriptions - Verified subscriptions for the same tenant.
 * @returns Available module projections for the portable selection coordinator.
 */
export function webAvailableModules(
  organization: OrganizationWorkspace,
  subscriptions: readonly WebSubscription[],
): readonly AvailableOrganizationModule[] {
  return APP_MODULES.filter((entry) => {
    if ("parentId" in entry) return false;
    const permission = getModuleVisibilityPermission(entry.id);
    if (
      permission &&
      !hasOrganizationPermission(organization.permissions, permission)
    )
      return false;
    const slug =
      entry.id === "sales" || entry.id === "purchases" ? "inventory" : entry.id;
    return (
      !entry.paid ||
      subscriptions.some(
        (subscription) =>
          subscription.product?.slug === slug &&
          ["active", "trial"].includes(subscription.status),
      )
    );
  }).map((entry) => ({
    id: moduleId(entry.id),
    code: entry.id as ModuleCode,
    name: entry.label,
  }));
}

/** Converts a verified operational company to the workspace package's minimal model.
 * @param company - Company whose ownership was checked by the Web adapter.
 * @param organization - Owning organization UUID.
 * @returns The immutable selection projection.
 */
export function webCompanyEntry(company: Company, organization: string) {
  return {
    id: companyId(company.id),
    organizationId: organizationId(organization),
    name: company.name,
    rif: company.rif ?? null,
    logoUrl: company.logoUrl ?? null,
  };
}
