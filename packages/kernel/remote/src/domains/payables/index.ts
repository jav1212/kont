import type { PayablesCommandReceiptDto, PayablesCommandRequest, PayablesPort, PayablesQueryRequest, PayablesReportDto } from "@kontave/client-contracts";
import { decodeRemote } from "../../decoding";
import type { RemoteTransport } from "../../transport";
import { payablesCommandReceipt, payablesReport } from "./decoding";

/** Authenticated remote adapter for scope-free Accounts Payable requests. */
export class RemotePayablesPort implements PayablesPort {
  /**
   * @param transport - Authenticated transport that owns envelope and token handling.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /** {@inheritDoc PayablesPort.command} */
  command(organizationId: string, companyId: string, request: PayablesCommandRequest): Promise<PayablesCommandReceiptDto> {
    return decodeRemote(this.transport, `${root(organizationId, companyId)}/payables/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: serializeScopeFreeRequest(request) }, payablesCommandReceipt);
  }

  /** {@inheritDoc PayablesPort.query} */
  query(organizationId: string, companyId: string, request: PayablesQueryRequest): Promise<PayablesReportDto> {
    return decodeRemote(this.transport, `${root(organizationId, companyId)}/payables/query`, { method: "POST", headers: { "content-type": "application/json" }, body: serializeScopeFreeRequest(request) }, payablesReport);
  }
}

function root(organizationId: string, companyId: string): string {
  if (!organizationId.trim() || !companyId.trim()) throw new Error("El contexto de cuentas por pagar no es válido.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}`;
}

/** Rejects caller-supplied scope before a request can cross an authenticated HTTP boundary. */
function serializeScopeFreeRequest(request: PayablesCommandRequest | PayablesQueryRequest): string {
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
    if (scopeFields.has(key)) throw new Error("La solicitud de cuentas por pagar no puede incluir alcance del servidor.");
    assertNoScopeFields(nested);
  }
}

const scopeFields = new Set(["tenantId", "organizationId", "companyId", "actorId"]);
