import { AsyncLocalStorage } from "node:async_hooks";

interface WebAuditContext {
  readonly actorId: string;
  readonly tenantId: string;
  readonly permission: string;
  readonly deviceId?: string;
}
const requests = new AsyncLocalStorage<WebAuditContext>();

/**
 * Isolates trusted audit identity across concurrent server requests.
 * @param context Identity resolved by the Web authentication boundary, never request claims.
 * @param operation Authorized operation whose Supabase calls inherit this identity.
 * @returns The operation result; asynchronous descendants retain their own request context.
 * @throws Propagates operation failures without retrying writes.
 */
export function withWebAuditContext<T>(
  context: WebAuditContext,
  operation: () => Promise<T>,
): Promise<T> {
  return requests.run(context, operation);
}

/**
 * Adds server-owned context to a service-role database request for transactional auditing.
 * @param headers Existing database request headers; caller-supplied audit claims are removed.
 * @returns A fresh header set containing only this asynchronous request's authenticated identity.
 * @throws Never for valid HeadersInit.
 */
export function webAuditHeaders(headers?: HeadersInit): Headers {
  const result = new Headers(headers);
  for (const name of ["actor", "tenant", "permission", "device"])
    result.delete(`x-kontave-audit-${name}`);
  const context = requests.getStore();
  if (context) {
    result.set("x-kontave-audit-actor", context.actorId);
    result.set("x-kontave-audit-tenant", context.tenantId);
    result.set("x-kontave-audit-permission", context.permission);
    if (context.deviceId)
      result.set("x-kontave-audit-device", context.deviceId);
  }
  return result;
}
