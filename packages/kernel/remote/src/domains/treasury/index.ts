import type { TreasuryCommandReceiptDto, TreasuryCommandRequest, TreasuryPageDto, TreasuryPort, TreasuryQueryRequest } from "@kontave/client-contracts";
import { decodeRemote } from "../../decoding";
import type { RemoteTransport } from "../../transport";
import { treasuryCommandReceipt, treasuryPage } from "./decoding";

/** Authenticated remote adapter for scope-free treasury requests. */
export class RemoteTreasuryPort implements TreasuryPort {
  /**
   * @param transport - Authenticated transport that owns envelope and token handling.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** {@inheritDoc TreasuryPort.command} */
  command(organizationId: string, companyId: string, request: TreasuryCommandRequest): Promise<TreasuryCommandReceiptDto> {
    return decodeRemote(this.transport, `${root(organizationId, companyId)}/treasury/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: serializeScopeFreeRequest(request) }, treasuryCommandReceipt);
  }

  /** {@inheritDoc TreasuryPort.query} */
  query(organizationId: string, companyId: string, request: TreasuryQueryRequest): Promise<TreasuryPageDto> {
    return decodeRemote(this.transport, `${root(organizationId, companyId)}/treasury/query`, { method: "POST", headers: { "content-type": "application/json" }, body: serializeScopeFreeRequest(request) }, treasuryPage);
  }
}

function root(organizationId: string, companyId: string): string {
  if (!organizationId.trim() || !companyId.trim()) throw new Error("El contexto de tesorería no es válido.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}`;
}

/** Rejects caller-supplied scope before a request can cross an authenticated HTTP boundary. */
function serializeScopeFreeRequest(request: TreasuryCommandRequest | TreasuryQueryRequest): string {
  assertNoScopeFields(request);
  return JSON.stringify(request);
}

function assertNoScopeFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoScopeFields(item);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (scopeFields.has(key)) throw new Error("La solicitud de tesorería no puede incluir alcance del servidor.");
    assertNoScopeFields(nested);
  }
}

const scopeFields = new Set(["tenantId", "organizationId", "companyId", "actorId"]);
