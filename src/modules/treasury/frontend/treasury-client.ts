import { KontaveRemoteClient, KontaveRemoteFailure, RemoteTreasuryPort, type RemoteTransport } from "@kontave/client-remote";
import type { TreasuryPageDto, TreasuryQueryRequest } from "@kontave/client-contracts";

/** One check delivery inside a batch, carrying its own retry identity because each item commits independently. */
export interface WebCheckDeliveryBatchItem {
  readonly deliveryEventId: string;
  readonly checkId: string;
  readonly recipientName: string;
  readonly deliveredAt: string;
  readonly evidenceReference?: string;
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

/** Per-check result of a delivery batch; failures carry the safe domain message. */
export type WebCheckDeliveryBatchOutcome =
  | { readonly checkId: string; readonly deliveryEventId: string; readonly status: "recorded" }
  | { readonly checkId: string; readonly deliveryEventId: string; readonly status: "failed"; readonly errorCode: string; readonly message: string };

/** Server-side batch ceiling enforced by `RecordCheckDeliveriesBatch`. */
export const CHECK_DELIVERY_BATCH_LIMIT = 100;

/** Batches run up to one hundred sequential commands server-side, beyond the default 10 s request budget. */
const BATCH_TIMEOUT_MS = 120_000;

/** Web Treasury boundary: the typed port plus the long-running transport for Web-only batch endpoints. */
export interface WebTreasuryClient {
  readonly port: RemoteTreasuryPort;
  readonly batchTransport: RemoteTransport;
}

/** Creates the typed Treasury boundary used by the authenticated Web client.
 * @param getAccessToken - Resolves the current Supabase access token for each request.
 * @returns A Treasury port that validates response envelopes and read rows, and a batch transport.
 */
export function createWebTreasuryClient(
  getAccessToken: () => Promise<string | null>,
): WebTreasuryClient {
  const baseUrl = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return {
    port: new RemoteTreasuryPort(new KontaveRemoteClient({ baseUrl, platform: "web", getAccessToken })),
    batchTransport: new KontaveRemoteClient({ baseUrl, platform: "web", getAccessToken, timeoutMs: BATCH_TIMEOUT_MS }),
  };
}

/** Reads one company-scoped Treasury page through the shared authenticated transport.
 * @param client - Validated Treasury adapter.
 * @param organizationId - Active organization identifier.
 * @param companyId - Active company identifier.
 * @param request - Scope-free query and pagination parameters.
 * @returns The validated Treasury page.
 * @throws When authentication, authorization, transport, or response decoding fails.
 */
export function queryWebTreasury(
  client: RemoteTreasuryPort,
  organizationId: string,
  companyId: string,
  request: TreasuryQueryRequest,
): Promise<TreasuryPageDto> {
  return client.query(organizationId, companyId, request);
}

/** Records up to one hundred check deliveries; each item commits or fails on its own.
 *
 * The batch envelope is a Web-only extension of the commands route, so it is not part of
 * `TreasuryCommandRequest` and is decoded here instead of by `RemoteTreasuryPort`.
 *
 * @param transport - Authenticated Web transport with a batch-sized timeout.
 * @param organizationId - Active organization identifier.
 * @param companyId - Active company identifier.
 * @param items - Between one and one hundred deliveries for distinct checks.
 * @returns One outcome per submitted item, in submission order.
 * @throws {KontaveRemoteFailure} When the batch is rejected as a whole or the response is malformed.
 */
export async function recordWebCheckDeliveries(
  transport: RemoteTransport,
  organizationId: string,
  companyId: string,
  items: readonly WebCheckDeliveryBatchItem[],
): Promise<readonly WebCheckDeliveryBatchOutcome[]> {
  if (items.length < 1 || items.length > CHECK_DELIVERY_BATCH_LIMIT) {
    throw new KontaveRemoteFailure("TREASURY_INVALID", `Selecciona entre 1 y ${CHECK_DELIVERY_BATCH_LIMIT} cheques.`);
  }
  const path = `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}/treasury/commands`;
  const payload = await transport.request<unknown>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "record_check_deliveries_batch", commands: items }),
  });
  if (!Array.isArray(payload) || payload.length !== items.length || !payload.every(isOutcome)) {
    throw new KontaveRemoteFailure("INVALID_RESPONSE", "Kontave devolvió datos no válidos.");
  }
  return payload;
}

function isOutcome(value: unknown): value is WebCheckDeliveryBatchOutcome {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.checkId !== "string" || typeof row.deliveryEventId !== "string") return false;
  return row.status === "recorded" || (row.status === "failed" && typeof row.errorCode === "string" && typeof row.message === "string");
}
