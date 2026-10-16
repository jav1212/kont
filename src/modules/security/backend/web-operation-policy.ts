import { z } from "zod";

const category = z.object({
  permission: z.string(),
  kind: z.string(),
  companyId: z.string(),
});
export const webSecurityScopeSchema = z.object({
  tenantId: z.string().uuid(),
  organizationId: z.string().uuid(),
  allowedCompanyIds: z.array(z.string()).nullable(),
  policies: z.array(category),
  grants: z.array(category.extend({ targetId: z.string() })),
});
export type WebSecurityScope = z.infer<typeof webSecurityScopeSchema>;

/**
 * Evaluates an exact configured category without granting unknown role capabilities.
 * @param scope Trusted persisted restrictions for the current membership.
 * @param permissions Canonical role permissions already verified by the server.
 * @param target Stable business target being accessed.
 * @param companyId Authoritative company, when the request operates on one.
 * @returns Whether the category is unconfigured or explicitly grants this target.
 * @throws Never; invalid or missing explicit grants deny access.
 */
export function allowsWebTarget(
  scope: WebSecurityScope,
  permissions: readonly string[],
  target: { kind: string; permission: string; id: string },
  companyId?: string,
): boolean {
  const applicable = (value: {
    kind: string;
    permission: string;
    companyId: string;
  }) =>
    value.kind === target.kind &&
    value.permission === target.permission &&
    (value.companyId === "" || value.companyId === companyId);
  if (!scope.policies.some(applicable)) return true;
  return (
    permissions.includes(target.permission) &&
    scope.grants.some(
      (grant) => applicable(grant) && grant.targetId === target.id,
    )
  );
}

/**
 * Checks an organization's configured company allow-list, including an intentionally empty list.
 * @param scope Trusted membership restriction snapshot.
 * @param companyId Company resolved from the requested resource.
 * @returns True for legacy unconfigured access or an explicitly included company.
 * @throws Never.
 */
export function allowsWebCompany(
  scope: WebSecurityScope,
  companyId: string,
): boolean {
  return (
    scope.allowedCompanyIds === null ||
    scope.allowedCompanyIds.includes(companyId)
  );
}

/**
 * Classifies existing Web permissions into stable exact-grant targets.
 * @param permission Canonical operation permission.
 * @param pathname Request path, without its query string.
 * @param method HTTP operation method.
 * @returns Module, table, process/action and report targets enforced by the server.
 * @throws Never.
 */
export function webOperationTargets(
  permission: string,
  pathname: string,
  method: string,
) {
  const resource = permission.split(".")[0]!;
  const business = [
    "sales",
    "purchases",
    "inventory",
    "payroll",
    "employees",
    "accounting",
    "documents",
  ];
  if (!business.includes(resource)) return [];
  const moduleId = resource === "employees" ? "payroll" : resource;
  const targets = [
    { kind: "module", permission: "modules.access", id: moduleId },
    { kind: "table", permission: "tables.access", id: resource },
  ];
  if (method !== "GET" && method !== "HEAD")
    targets.push(
      { kind: "process", permission: "processes.execute", id: permission },
      {
        kind: "toolbar_action",
        permission: "toolbar_actions.use",
        id: permission,
      },
    );
  if (/report|ledger|kardex|balance|reporting/.test(pathname))
    targets.push({ kind: "report", permission: "reports.run", id: permission });
  return targets;
}
