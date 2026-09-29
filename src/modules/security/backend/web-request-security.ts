import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allowsWebCompany,
  allowsWebTarget,
  webOperationTargets,
  type WebSecurityScope,
} from "./web-operation-policy";

type OwnershipReference = { readonly table: string; readonly id: string };

const entityTables: readonly [RegExp, string][] = [
  [
    /^\/api\/inventory\/movements\/(?!draft(?:\/|$))([^/]+)\/?$/,
    "shared_inventory_movements",
  ],
  [
    /^\/api\/inventory\/departments\/([^/]+)\/?$/,
    "shared_inventory_departments",
  ],
  [/^\/api\/purchases\/suppliers\/([^/]+)\/?$/, "shared_inventory_suppliers"],
  [
    /^\/api\/purchases\/imports\/([^/]+)(?:\/execute)?\/?$/,
    "shared_inventory_purchase_import_batches",
  ],
  [/^\/api\/accounting\/accounts\/([^/]+)\/?$/, "shared_accounting_accounts"],
  [
    /^\/api\/accounting\/charts\/(?!import(?:\/|$))([^/]+)\/?$/,
    "shared_accounting_charts",
  ],
  [
    /^\/api\/accounting\/periods\/([^/]+)(?:\/close)?\/?$/,
    "shared_accounting_periods",
  ],
  [
    /^\/api\/accounting\/integration-rules\/([^/]+)\/?$/,
    "shared_accounting_integration_rules",
  ],
  [
    /^\/api\/sales\/customers\/(?!consumer-final(?:\/|$))([^/]+)(?:\/credit-limit)?\/?$/,
    "shared_inventory_customers",
  ],
  [
    /^\/api\/sales\/(?!customers(?:\/|$)|receivables(?:\/|$)|igtf-fortnightly(?:\/|$))([^/]+)(?:\/(?:confirm|unconfirm))?\/?$/,
    "shared_inventory_sales_invoices",
  ],
  [
    /^\/api\/inventory\/products\/([^/]+)(?:\/(?:history|components))?\/?$/,
    "shared_inventory_products",
  ],
  [
    /^\/api\/purchases\/(?!imports(?:\/|$)|islr-retentions-export(?:\/|$)|iva-retention-export(?:\/|$)|migrate(?:\/|$)|suppliers(?:\/|$))([^/]+)(?:\/(?:confirm|cancel|unconfirm|impute-items))?\/?$/,
    "shared_inventory_purchase_invoices",
  ],
  [
    /^\/api\/accounting\/entries\/([^/]+)(?:\/post)?\/?$/,
    "shared_accounting_entries",
  ],
];

const payrollRunTables: readonly [RegExp, string, "query" | "body"][] = [
  [/^\/api\/payroll\/receipts\/?$/, "shared_payroll_runs", "query"],
  [/^\/api\/payroll\/runs\/unconfirm\/?$/, "shared_payroll_runs", "body"],
  [
    /^\/api\/payroll\/cesta-ticket\/receipts\/?$/,
    "shared_payroll_cesta_ticket_runs",
    "query",
  ],
  [
    /^\/api\/payroll\/cesta-ticket\/runs\/unconfirm\/?$/,
    "shared_payroll_cesta_ticket_runs",
    "body",
  ],
  [
    /^\/api\/payroll\/bono-guerra\/receipts\/?$/,
    "shared_payroll_bono_guerra_runs",
    "query",
  ],
  [
    /^\/api\/payroll\/bono-guerra\/runs\/unconfirm\/?$/,
    "shared_payroll_bono_guerra_runs",
    "body",
  ],
  [
    /^\/api\/payroll\/bonificaciones\/receipts\/?$/,
    "shared_payroll_bonifications_runs",
    "query",
  ],
  [
    /^\/api\/payroll\/bonificaciones\/runs\/unconfirm\/?$/,
    "shared_payroll_bonifications_runs",
    "body",
  ],
];

/**
 * Resolves company ownership and evaluates the restrictions of an authenticated Web operation.
 * A configured company allow-list is checked against both supplied company IDs and
 * the company read from a referenced persistent entity. A forged query or body
 * company cannot therefore authorize a resource held by another company.
 *
 * @param request Original request; JSON is read from a clone and never consumed for the handler.
 * @param scope Persisted current-user policy supplied by the trusted authentication boundary.
 * @param permissions Verified canonical role permissions.
 * @param permission Canonical permission required by the route.
 * @param client Server-only client used for authoritative resource ownership reads.
 * @returns True when every resolved company and configured exact target permits the operation.
 * @throws Error on persistence failures; callers must fail closed.
 */
export async function allowsWebRequest(
  request: Request,
  scope: WebSecurityScope,
  permissions: readonly string[],
  permission: string,
  client: SupabaseClient,
): Promise<boolean> {
  const url = new URL(request.url);
  const targets = webOperationTargets(permission, url.pathname, request.method);
  const companies = collectQueryCompanyIds(url);
  const body = await requestBody(request);
  collectCompanyIds(body, companies);

  if (scope.allowedCompanyIds !== null) {
    for (const reference of ownershipReferences(url, request.method, body)) {
      const companyId = await authoritativeCompanyId(
        client,
        scope.tenantId,
        reference,
      );
      if (companyId === null) return false;
      companies.add(companyId);
    }
    if (companies.size === 0 && targets.length > 0) return false;
  }
  for (const company of companies)
    if (!allowsWebCompany(scope, company)) return false;
  const contexts: (string | undefined)[] = companies.size
    ? [...companies]
    : [undefined];
  return contexts.every((companyId) =>
    targets.every((target) =>
      allowsWebTarget(scope, permissions, target, companyId),
    ),
  );
}

function collectQueryCompanyIds(url: URL): Set<string> {
  const companies = new Set<string>();
  for (const key of ["companyId", "company_id"]) {
    for (const value of url.searchParams.getAll(key))
      if (value) companies.add(value);
  }
  return companies;
}

async function requestBody(request: Request): Promise<unknown> {
  if (
    ["GET", "HEAD"].includes(request.method) ||
    !request.headers.get("content-type")?.includes("application/json")
  )
    return null;
  return request
    .clone()
    .json()
    .catch(() => null);
}

function ownershipReferences(
  url: URL,
  method: string,
  body: unknown,
): readonly OwnershipReference[] {
  const references: OwnershipReference[] = [];
  for (const [pattern, table] of entityTables) {
    const id = pattern.exec(url.pathname)?.[1];
    if (id) references.push({ table, id: decodeURIComponent(id) });
  }
  for (const [pattern, table, source] of payrollRunTables) {
    if (!pattern.test(url.pathname)) continue;
    const id =
      source === "query"
        ? url.searchParams.get("runId")
        : topLevelText(body, "runId");
    if (id) references.push({ table, id });
  }
  if (
    method !== "GET" &&
    method !== "HEAD" &&
    url.pathname === "/api/sales/receivables"
  ) {
    const id = topLevelText(body, "receivableId");
    if (id) references.push({ table: "shared_sales_receivables", id });
  }
  return references;
}

async function authoritativeCompanyId(
  client: SupabaseClient,
  tenantId: string,
  reference: OwnershipReference,
): Promise<string | null> {
  const { data, error } = await client
    .from(reference.table)
    .select("company_id")
    .eq("tenant_id", tenantId)
    .eq("id", reference.id)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data && typeof data.company_id === "string" && data.company_id
    ? data.company_id
    : null;
}

function topLevelText(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate ? candidate : null;
}

function collectCompanyIds(
  value: unknown,
  companies: Set<string>,
  depth = 0,
): void {
  if (depth > 8 || !value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectCompanyIds(item, companies, depth + 1);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      (key === "companyId" || key === "company_id") &&
      typeof item === "string" &&
      item
    )
      companies.add(item);
    else if (item && typeof item === "object")
      collectCompanyIds(item, companies, depth + 1);
  }
}
