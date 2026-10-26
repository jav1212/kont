import type { AccountingCommandReceiptDto, AccountingCommandRequest, AccountingPort, AccountingQueryRequest, AccountingQueryResultDto } from "@kontave/client-contracts";
import { decodeRemote } from "../../decoding";
import type { RemoteTransport } from "../../transport";
import { accountingCommandReceipt, accountingQueryResult } from "./decoding";

/** Authenticated remote adapter for scope-free accounting requests. */
export class RemoteAccountingPort implements AccountingPort {
  /**
   * Binds accounting requests to the shared authenticated transport.
   * @param transport - Transport that owns token, correlation, and response handling.
   * @returns A remote accounting port.
   * @throws Never during construction.
   */
  public constructor(private readonly transport: RemoteTransport) {}

  /** {@inheritDoc AccountingPort.command} */
  public command(organizationId: string, companyId: string, request: AccountingCommandRequest): Promise<AccountingCommandReceiptDto> {
    return decodeRemote(this.transport, `${root(organizationId, companyId)}/accounting/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: serialize(request) }, accountingCommandReceipt);
  }

  /** {@inheritDoc AccountingPort.query} */
  public query(organizationId: string, companyId: string, request: AccountingQueryRequest): Promise<AccountingQueryResultDto> {
    return decodeRemote(this.transport, `${root(organizationId, companyId)}/accounting/query`, { method: "POST", headers: { "content-type": "application/json" }, body: serialize(request) }, accountingQueryResult);
  }
}

function root(organizationId: string, companyId: string): string {
  if (!organizationId.trim() || !companyId.trim()) throw new Error("El contexto contable no es válido.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}`;
}

function serialize(request: AccountingCommandRequest | AccountingQueryRequest): string {
  assertScopeFree(request);
  return JSON.stringify(request);
}

function assertScopeFree(value: unknown): void {
  if (Array.isArray(value)) { for (const item of value) assertScopeFree(item); return; }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (scopeFields.has(key)) throw new Error("La solicitud contable no puede incluir alcance del servidor.");
    assertScopeFree(nested);
  }
}

const scopeFields = new Set(["tenantId", "organizationId", "companyId", "actorId"]);
