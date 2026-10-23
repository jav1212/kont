"use client";

import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";

/** Company scope sent with every payables request; the server re-derives tenant and actor. */
export interface PayablesRequestScope {
  readonly organizationId: string;
  readonly companyId: string;
}

/** Failure returned by the payables API with its user-facing Spanish message. */
export class PayablesRequestFailure extends Error {
  /**
   * @param message - Presentable message from the API or a safe fallback.
   * @param code - API error code, when the server returned one.
   * @param status - HTTP status of the failed response.
   * @returns A typed request failure.
   * @throws Never; construction only records the failure.
   */
  public constructor(message: string, public readonly code: string | null, public readonly status: number) {
    super(message);
    this.name = "PayablesRequestFailure";
  }
}

async function post<T>(path: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const accessToken = (await getSupabaseBrowser().auth.getSession()).data.session?.access_token;
  const response = await fetch(path, {
    method: "POST", cache: "no-store",
    headers: { "content-type": "application/json", ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; error?: { code?: string; message?: string } };
  if (!response.ok) throw new PayablesRequestFailure(payload.error?.message ?? fallback, payload.error?.code ?? null, response.status);
  return payload.data as T;
}

/** Loads one company-scoped payables report page.
 * @param scope - Selected organization and company.
 * @param query - Report kind and its filters.
 * @returns Report rows and total from one database snapshot.
 * @throws {PayablesRequestFailure} When the API rejects or cannot serve the report.
 */
export function queryPayables<TRow = Readonly<Record<string, unknown>>>(scope: PayablesRequestScope, query: Readonly<Record<string, unknown>> & { readonly kind: string }): Promise<{ readonly rows: readonly TRow[]; readonly total: number }> {
  return post("/api/payables/query", { ...scope, limit: 100, offset: 0, ...query }, "No se pudo cargar la información de cuentas por pagar.");
}

/** Executes one idempotent payables command with fresh idempotency and correlation keys.
 * @param scope - Selected organization and company.
 * @param command - Command kind and facts; keys are added here.
 * @returns The persisted command receipt.
 * @throws {PayablesRequestFailure} When validation, permission, concurrency or persistence fails.
 */
export function executePayablesCommand(scope: PayablesRequestScope, command: Readonly<Record<string, unknown>> & { readonly kind: string }): Promise<{ readonly commandId: string; readonly affectedIds: readonly string[] }> {
  return post("/api/payables/commands", { ...scope, command: { idempotencyKey: newPayablesId(), correlationId: newPayablesId(), ...command } }, "No se pudo registrar la operación.");
}

/** Generates an identifier for a new document, application or plan.
 * @returns A random UUID.
 * @throws Never.
 */
export function newPayablesId(): string {
  return crypto.randomUUID();
}

/** Current operational date in Venezuela.
 * @returns The date as `YYYY-MM-DD`.
 * @throws Never.
 */
export function payablesToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Spanish labels for payable document kinds. */
export const PAYABLE_KIND_LABELS: Readonly<Record<string, string>> = {
  invoice: "Factura", debit_note: "Nota de débito", credit_note: "Nota de crédito", manual_document: "Documento manual",
  positive_adjustment: "Ajuste positivo", negative_adjustment: "Ajuste negativo", installment: "Giro", opening_balance: "Saldo inicial",
};

/** Spanish labels for document states; "cancelado" means fully paid in Venezuelan usage. */
export const PAYABLE_STATUS_LABELS: Readonly<Record<string, string>> = { open: "Pendiente", settled: "Cancelado", voided: "Anulado" };

/** Spanish labels for application kinds. */
export const PAYABLE_APPLICATION_LABELS: Readonly<Record<string, string>> = {
  payment: "Pago", credit_note: "Nota de crédito", negative_adjustment: "Ajuste negativo", withholding_vat: "Retención IVA",
  withholding_islr: "Retención ISLR", installment_transfer: "Traspaso a giros",
};

/** Formats an exact decimal string for display without converting it to a float.
 * @param value - Exact decimal text from the API.
 * @returns The amount with two decimals and thousands separators, or a dash.
 * @throws Never.
 */
export function formatPayablesAmount(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "—";
  const [whole = "0", fraction = ""] = String(value).replace(/^-/, "").split(".");
  const sign = String(value).startsWith("-") ? "-" : "";
  return `${sign}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(fraction + "00").slice(0, 2)}`;
}
