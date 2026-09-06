import { salesDashboard } from "./decoding";
import { decodeRemote } from "../../decoding";
import type {
  SalesDashboardDto,
  SalesDashboardQuery,
  SalesPort,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for sales read models. */
export class RemoteSalesPort implements SalesPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /**
   * Loads a sales dashboard.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param query - Period, granularity and recent-document limit.
   * @returns Sales dashboard snapshot.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  dashboard(
    organizationId: string,
    companyId: string,
    query: SalesDashboardQuery,
  ): Promise<SalesDashboardDto> {
    return decodeRemote(
      this.transport,
      `${root(organizationId, companyId)}/sales/dashboard${queryString(query)}`,
      { method: "GET" },
      salesDashboard,
    );
  }
}

function root(organizationId: string, companyId: string): string {
  if (!organizationId.trim() || !companyId.trim())
    throw new Error("El contexto de Ventas no es válido.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}`;
}

function queryString(query: SalesDashboardQuery): string {
  return `?${new URLSearchParams({
    from: query.from,
    to: query.to,
    granularity: query.granularity ?? "day",
    limit: String(query.limit ?? 5),
  }).toString()}`;
}
