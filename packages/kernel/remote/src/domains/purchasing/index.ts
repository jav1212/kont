import { purchasingDashboard } from "./decoding";
import { decodeRemote } from "../../decoding";
import type {
  PurchasingDashboardDto,
  PurchasingDashboardQuery,
  PurchasingPort,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for purchasing read models. */
export class RemotePurchasingPort implements PurchasingPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /**
   * Loads a purchasing dashboard.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param query - Period, granularity and recent-document limit.
   * @returns Purchasing dashboard snapshot.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  dashboard(
    organizationId: string,
    companyId: string,
    query: PurchasingDashboardQuery,
  ): Promise<PurchasingDashboardDto> {
    return decodeRemote(
      this.transport,
      `${root(organizationId, companyId)}/purchasing/dashboard${queryString(query)}`,
      { method: "GET" },
      purchasingDashboard,
    );
  }
}

function root(organizationId: string, companyId: string): string {
  if (!organizationId.trim() || !companyId.trim())
    throw new Error("El contexto de Compras no es válido.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}`;
}

function queryString(query: PurchasingDashboardQuery): string {
  return `?${new URLSearchParams({
    from: query.from,
    to: query.to,
    granularity: query.granularity ?? "day",
    limit: String(query.limit ?? 5),
  }).toString()}`;
}
