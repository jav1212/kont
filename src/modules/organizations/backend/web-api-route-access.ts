import type { PERMISSIONS } from "@kontave/access-control/domain";

type CanonicalPermission = typeof PERMISSIONS[keyof typeof PERMISSIONS];
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RouteRule = readonly [method: HttpMethod, pathname: string, permission: CanonicalPermission | null];

/**
 * Explicit compatibility policies for handlers still using withTenant.
 * Null means an authenticated, active membership may access shell metadata or
 * its own reminders; it never means anonymous access. Routes migrated to an
 * explicit permission wrapper declare their policy in the handler instead.
 */
const ROUTES: readonly RouteRule[] = [
  ["GET","/api/access/badges","access.manage"],
  ["POST","/api/access/badges","access.manage"],
  ["POST","/api/access/badges/print","access.manage"],
  ["POST","/api/access/badges/[id]/print","access.manage"],
  ["POST","/api/access/badges/[id]/revoke","access.manage"],
  ["GET","/api/access/terminals","access.manage"],
  ["POST","/api/access/terminals","access.manage"],
  ["POST","/api/access/terminals/[id]/revoke","access.manage"],
  ["GET","/api/accounting/accounts","accounting.read"],
  ["POST","/api/accounting/accounts","accounting.create"],
  ["DELETE","/api/accounting/accounts/[id]","accounting.update"],
  ["POST","/api/accounting/charts/import","accounting.create"],
  ["GET","/api/accounting/charts","accounting.read"],
  ["POST","/api/accounting/charts","accounting.create"],
  ["PATCH","/api/accounting/charts/[id]","accounting.update"],
  ["DELETE","/api/accounting/charts/[id]","accounting.update"],
  ["GET","/api/accounting/entries","accounting.read"],
  ["POST","/api/accounting/entries","accounting.create"],
  ["POST","/api/accounting/entries/[id]/post","accounting.post"],
  ["GET","/api/accounting/entries/[id]","accounting.read"],
  ["GET","/api/accounting/integration-log","accounting.read"],
  ["GET","/api/accounting/integration-rules","accounting.read"],
  ["POST","/api/accounting/integration-rules","accounting.create"],
  ["DELETE","/api/accounting/integration-rules/[id]","accounting.update"],
  ["GET","/api/accounting/periods","accounting.read"],
  ["POST","/api/accounting/periods","accounting.create"],
  ["GET","/api/accounting/trial-balance","accounting.read"],
  ["GET","/api/billing/capacity",null],
  ["GET","/api/billing/subscriptions",null],
  ["GET","/api/billing/tenant",null],
  ["GET","/api/companies/get-by-id","companies.read"],
  ["GET","/api/companies/get-by-owner","companies.read"],
  ["POST","/api/documents/folders/replicate","documents.create"],
  ["GET","/api/documents/folders","documents.read"],
  ["POST","/api/documents/folders","documents.create"],
  ["PATCH","/api/documents/folders/[id]","documents.update"],
  ["DELETE","/api/documents/folders/[id]","documents.delete"],
  ["GET","/api/documents","documents.read"],
  ["POST","/api/documents","documents.create"],
  ["POST","/api/documents/upload-url","documents.create"],
  ["GET","/api/documents/[id]/download-url","documents.read"],
  ["DELETE","/api/documents/[id]","documents.delete"],
  ["PATCH","/api/documents/[id]","documents.update"],
  ["GET","/api/employees/get-by-company","employees.read"],
  ["GET","/api/employees/salary-history","employees.read"],
  ["POST","/api/inventory/adjustments/generate","inventory.create"],
  ["POST","/api/inventory/adjustments","inventory.create"],
  ["GET","/api/inventory/balance-report","inventory.read"],
  ["GET","/api/inventory/closings","inventory.read"],
  ["POST","/api/inventory/closings","inventory.create"],
  ["GET","/api/inventory/departments","inventory.read"],
  ["POST","/api/inventory/departments","inventory.create"],
  ["DELETE","/api/inventory/departments/[id]","inventory.delete"],
  ["GET","/api/inventory/inventory-ledger","inventory.read"],
  ["GET","/api/inventory/islr-report","inventory.read"],
  ["GET","/api/inventory/movements/draft","inventory.read"],
  ["POST","/api/inventory/movements/draft","inventory.create"],
  ["DELETE","/api/inventory/movements/draft","inventory.delete"],
  ["POST","/api/inventory/movements/draft/[id]/confirm","inventory.update"],
  ["GET","/api/inventory/movements","inventory.read"],
  ["POST","/api/inventory/movements","inventory.create"],
  ["DELETE","/api/inventory/movements/[id]","inventory.delete"],
  ["PATCH","/api/inventory/movements/[id]","inventory.update"],
  ["GET","/api/inventory/purchase-ledger","inventory.read"],
  ["GET","/api/inventory/report","inventory.read"],
  ["POST","/api/inventory/sales/generate","inventory.create"],
  ["POST","/api/inventory/sales","inventory.create"],
  ["GET","/api/inventory/sales-ledger","inventory.read"],
  ["POST","/api/memberships/invite","members.invite"],
  ["GET","/api/memberships/members","members.read"],
  ["POST","/api/memberships/members","members.invite"],
  ["DELETE","/api/memberships/[memberId]","members.revoke"],
  ["GET","/api/payroll/ari","payroll.read"],
  ["PUT","/api/payroll/ari","payroll.create"],
  ["DELETE","/api/payroll/ari","payroll.delete"],
  ["GET","/api/payroll/bonificaciones/receipts","payroll.read"],
  ["POST","/api/payroll/bonificaciones/runs/confirm","payroll.confirm"],
  ["POST","/api/payroll/bonificaciones/runs/draft","payroll.create"],
  ["GET","/api/payroll/bonificaciones/runs","payroll.read"],
  ["POST","/api/payroll/bonificaciones/runs/unconfirm","payroll.delete"],
  ["GET","/api/payroll/bono-guerra/receipts","payroll.read"],
  ["POST","/api/payroll/bono-guerra/runs/confirm","payroll.confirm"],
  ["POST","/api/payroll/bono-guerra/runs/draft","payroll.create"],
  ["GET","/api/payroll/bono-guerra/runs","payroll.read"],
  ["POST","/api/payroll/bono-guerra/runs/unconfirm","payroll.delete"],
  ["GET","/api/payroll/cesta-ticket/receipts","payroll.read"],
  ["POST","/api/payroll/cesta-ticket/runs/confirm","payroll.confirm"],
  ["POST","/api/payroll/cesta-ticket/runs/draft","payroll.create"],
  ["GET","/api/payroll/cesta-ticket/runs","payroll.read"],
  ["POST","/api/payroll/cesta-ticket/runs/unconfirm","payroll.delete"],
  ["GET","/api/payroll/receipts","payroll.read"],
  ["POST","/api/payroll/runs/draft","payroll.create"],
  ["GET","/api/payroll/runs","payroll.read"],
  ["POST","/api/payroll/runs/unconfirm","payroll.delete"],
  ["GET","/api/payroll/settings","payroll.read"],
  ["PUT","/api/payroll/settings","payroll.create"],
  ["GET","/api/purchases/imports","purchases.read"],
  ["POST","/api/purchases/imports","purchases.create"],
  ["POST","/api/purchases/imports/[id]/execute","purchases.create"],
  ["GET","/api/purchases/imports/[id]","purchases.read"],
  ["GET","/api/purchases/islr-retentions-export","purchases.read"],
  ["GET","/api/purchases/iva-retention-export","purchases.read"],
  ["POST","/api/purchases/migrate","purchases.create"],
  ["GET","/api/purchases","purchases.read"],
  ["POST","/api/purchases","purchases.create"],
  ["GET","/api/purchases/suppliers","purchases.read"],
  ["POST","/api/purchases/suppliers","purchases.create"],
  ["DELETE","/api/purchases/suppliers/[id]","purchases.create"],
  ["POST","/api/purchases/[id]/confirm","purchases.confirm"],
  ["POST","/api/purchases/[id]/impute-items","purchases.create"],
  ["GET","/api/purchases/[id]","purchases.read"],
  ["DELETE","/api/purchases/[id]","purchases.create"],
  ["POST","/api/purchases/[id]","purchases.create"],
  ["POST","/api/purchases/[id]/unconfirm","purchases.cancel"],
  ["POST","/api/referrals/attach","referrals.manage"],
  ["GET","/api/sales/customers","sales.read"],
  ["GET","/api/sales/igtf-fortnightly","sales.read"],
  ["GET","/api/sales/[id]","sales.read"],
  ["POST","/api/sales/[id]/unconfirm","sales.cancel"],
  ["GET","/api/seniat-reminders/list",null],
  ["POST","/api/seniat-reminders/subscribe",null],
  ["POST","/api/seniat-reminders/test",null],
  ["POST","/api/seniat-reminders/unsubscribe",null],
  ["PATCH","/api/seniat-reminders/update",null],
];

/**
 * Checks whether a handler's exact method/template has an explicit policy.
 * @param method - Exported HTTP method.
 * @param pathname - Repository route template, including dynamic segments.
 * @returns Whether this declaration is registered, without dynamic matching.
 */
export function hasRegisteredWebApiRoute(method: string, pathname: string): boolean {
  return ROUTES.some(([verb, template]) => verb === method && template === pathname);
}

/**
 * Resolves the permission of a registered Web compatibility route.
 * @param request - Request whose HTTP method and pathname identify the operation.
 * @returns Its canonical permission, authenticated-only metadata policy, or a deny sentinel.
 */
export function resolveWebApiPermission(request: Request): CanonicalPermission | null | "authorization.denied" {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  const exact = ROUTES.find(([method, template]) => method === request.method && template === pathname);
  if (exact) return exact[2];
  // An existing static route with another method cannot fall through to [id].
  if (ROUTES.some(([, template]) => template === pathname)) return "authorization.denied";
  const segments = pathname.split("/").filter(Boolean);
  const dynamic = ROUTES.find(([method, template]) => {
    if (method !== request.method || !template.includes("[")) return false;
    const parts = template.split("/").filter(Boolean);
    return parts.length === segments.length && parts.every((part, index) =>
      (part.startsWith("[") && part.endsWith("]")) || part === segments[index]);
  });
  return dynamic ? dynamic[2] : "authorization.denied";
}
