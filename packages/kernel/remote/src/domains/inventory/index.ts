import {
  inventoryDashboard,
  inventoryOperation,
  inventoryFlowPage,
} from "./decoding";
import { decodeRemote } from "../../decoding";
import type {
  CreateInventoryOperationDto,
  InventoryDashboardDto,
  InventoryDashboardQuery,
  InventoryFlowPageDto,
  InventoryFlowQuery,
  InventoryPort,
  InventoryOperationDetailDto,
  ReverseInventoryOperationDto,
  UpdateInventoryOperationDto,
} from "@kontave/client-contracts";
import type { RemoteTransport } from "../../transport";

/** Remote adapter for inventory dashboards and auditable operations. */
export class RemoteInventoryPort implements InventoryPort {
  /**
   * Creates the adapter.
   * @param transport - Authenticated Client API transport.
   */
  constructor(private readonly transport: RemoteTransport) {}

  /**
   * Loads the inventory dashboard.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param query - Date range, granularity and recent-item limit.
   * @returns Inventory dashboard snapshot.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  dashboard(
    organizationId: string,
    companyId: string,
    query: InventoryDashboardQuery,
  ): Promise<InventoryDashboardDto> {
    return decodeRemote(
      this.transport,
      `${root(organizationId, companyId)}/inventory/dashboard${queryString(query)}`,
      { method: "GET" },
      inventoryDashboard,
    );
  }

  /**
   * Lists inbound inventory flow.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param query - Flow filters and pagination.
   * @returns A page of inbound movements.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  entries(
    organizationId: string,
    companyId: string,
    query: InventoryFlowQuery,
  ): Promise<InventoryFlowPageDto> {
    return this.flow("entries", organizationId, companyId, query);
  }

  /**
   * Lists outbound inventory flow.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param query - Flow filters and pagination.
   * @returns A page of outbound movements.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  outputs(
    organizationId: string,
    companyId: string,
    query: InventoryFlowQuery,
  ): Promise<InventoryFlowPageDto> {
    return this.flow("outputs", organizationId, companyId, query);
  }

  /**
   * Lists manual inventory operations.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param query - Operation filters and pagination.
   * @returns A page of manual inventory operations.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  operations(
    organizationId: string,
    companyId: string,
    query: InventoryFlowQuery,
  ): Promise<InventoryFlowPageDto> {
    return this.flow("operations", organizationId, companyId, {
      ...query,
      sourceKind: "inventory",
    });
  }

  /**
   * Loads one inventory operation.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param operationId - Inventory operation identifier.
   * @returns Operation details.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  operation(
    organizationId: string,
    companyId: string,
    operationId: string,
  ): Promise<InventoryOperationDetailDto> {
    return decodeRemote(
      this.transport,
      `${operationRoot(organizationId, companyId)}/${segment(operationId)}`,
      { method: "GET" },
      inventoryOperation,
    );
  }

  /**
   * Creates a draft inventory operation.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param command - Draft operation data.
   * @returns Created operation.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  create(
    organizationId: string,
    companyId: string,
    command: CreateInventoryOperationDto,
  ): Promise<InventoryOperationDetailDto> {
    return decodeRemote(
      this.transport,
      operationRoot(organizationId, companyId),
      json("POST", command),
      inventoryOperation,
    );
  }

  /**
   * Updates a draft inventory operation.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param operationId - Inventory operation identifier.
   * @param command - Versioned operation changes.
   * @returns Updated operation.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  update(
    organizationId: string,
    companyId: string,
    operationId: string,
    command: UpdateInventoryOperationDto,
  ): Promise<InventoryOperationDetailDto> {
    return decodeRemote(
      this.transport,
      `${operationRoot(organizationId, companyId)}/${segment(operationId)}`,
      json("PATCH", command),
      inventoryOperation,
    );
  }

  /**
   * Posts a draft inventory operation.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param operationId - Inventory operation identifier.
   * @param expectedVersion - Version required for optimistic concurrency.
   * @returns Posted operation.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  post(
    organizationId: string,
    companyId: string,
    operationId: string,
    expectedVersion: number,
  ): Promise<InventoryOperationDetailDto> {
    return decodeRemote(
      this.transport,
      `${operationRoot(organizationId, companyId)}/${segment(operationId)}/post`,
      json("POST", { expectedVersion }),
      inventoryOperation,
    );
  }

  /**
   * Reverses a posted inventory operation.
   * @param organizationId - Owning organization.
   * @param companyId - Operational company.
   * @param operationId - Inventory operation identifier.
   * @param command - Version and reversal reason.
   * @returns Reversed operation.
   * @throws KontaveRemoteFailure when the transport fails or response data violates the DTO contract.
   */
  reverse(
    organizationId: string,
    companyId: string,
    operationId: string,
    command: ReverseInventoryOperationDto,
  ): Promise<InventoryOperationDetailDto> {
    return decodeRemote(
      this.transport,
      `${operationRoot(organizationId, companyId)}/${segment(operationId)}/reverse`,
      json("POST", command),
      inventoryOperation,
    );
  }

  private flow(
    kind: "entries" | "outputs" | "operations",
    organizationId: string,
    companyId: string,
    query: InventoryFlowQuery,
  ): Promise<InventoryFlowPageDto> {
    return decodeRemote(
      this.transport,
      `${root(organizationId, companyId)}/inventory/${kind}${queryString(query)}`,
      { method: "GET" },
      inventoryFlowPage,
    );
  }
}

function root(organizationId: string, companyId: string): string {
  if (!organizationId.trim() || !companyId.trim())
    throw new Error("El contexto de Inventario no es válido.");
  return `/api/client/v1/organizations/${encodeURIComponent(organizationId)}/companies/${encodeURIComponent(companyId)}`;
}

function operationRoot(organizationId: string, companyId: string): string {
  return `${root(organizationId, companyId)}/inventory/operations`;
}

function segment(value: string): string {
  if (!value.trim())
    throw new Error("La operación de Inventario no es válida.");
  return encodeURIComponent(value);
}

function queryString(query: object): string {
  const values = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (
      (typeof value === "string" || typeof value === "number") &&
      value !== ""
    )
      values.set(key, String(value));
  });
  return `?${values.toString()}`;
}

function json(method: "POST" | "PATCH", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
