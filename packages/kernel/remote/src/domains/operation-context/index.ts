import { operationalDefaults, exchangeRateSet } from "./decoding";
import { decodeRemote } from "../../decoding";
import type {
  ExchangeRateSetDto,
  OperationContextPort,
  OperationalDefaultsDto,
  UpdateOperationalDefaultsDto,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

export * from "./store";

/** Remote adapter for company-scoped operational defaults and exchange rates. */
export class RemoteOperationContextPort implements OperationContextPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /**
   * Loads company operational defaults.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @returns Persisted defaults and resolved exchange-rate selection.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  get(
    organizationId: string,
    companyId: string,
  ): Promise<OperationalDefaultsDto> {
    return decodeRemote(
      this.transport,
      root(organizationId, companyId),
      { method: "GET" },
      operationalDefaults,
    );
  }

  /**
   * Updates company operational defaults.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param command - Versioned defaults update.
   * @returns Updated operational defaults.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  update(
    organizationId: string,
    companyId: string,
    command: UpdateOperationalDefaultsDto,
  ): Promise<OperationalDefaultsDto> {
    return decodeRemote(
      this.transport,
      root(organizationId, companyId),
      json(command),
      operationalDefaults,
    );
  }

  /**
   * Resolves exchange rates for a local date.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param date - Local effective date in YYYY-MM-DD format.
   * @returns Exchange-rate set resolved by the server.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  exchangeRates(
    organizationId: string,
    companyId: string,
    date: string,
  ): Promise<ExchangeRateSetDto> {
    return decodeRemote(
      this.transport,
      `${root(organizationId, companyId)}/exchange-rates?date=${encodeURIComponent(date)}`,
      { method: "GET" },
      exchangeRateSet,
    );
  }
}

function root(organizationId: string, companyId: string): string {
  if (!organizationId.trim() || !companyId.trim())
    throw new Error("El contexto operacional no es válido.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}/operation-context`;
}

function json(body: unknown): RequestInit {
  return {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
