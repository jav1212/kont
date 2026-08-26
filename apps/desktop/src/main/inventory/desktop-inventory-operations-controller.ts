import type {
  ClientPortFeature,
  CreateInventoryOperationDto,
  InventoryFlowPageDto,
  InventoryOperationDetailDto,
  InventoryPort,
  ReverseInventoryOperationDto,
  UpdateInventoryOperationDto,
} from "@kontave/client-contracts";
import type {
  DesktopInventoryFlowQuery,
  DesktopInventoryResult,
} from "../../renderer-bridge";

export class DesktopInventoryOperationsController {
  constructor(private readonly inventory: ClientPortFeature<InventoryPort>) {}
  entries(organizationId: unknown, companyId: unknown, query: unknown) {
    return this.list("entries", organizationId, companyId, query);
  }
  outputs(organizationId: unknown, companyId: unknown, query: unknown) {
    return this.list("outputs", organizationId, companyId, query);
  }
  operations(organizationId: unknown, companyId: unknown, query: unknown) {
    return this.list("operations", organizationId, companyId, query);
  }
  operation(
    organizationId: unknown,
    companyId: unknown,
    operationId: unknown,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>> {
    return this.inventory.operation(
      segment(organizationId),
      segment(companyId),
      segment(operationId),
    );
  }
  create(
    organizationId: unknown,
    companyId: unknown,
    command: CreateInventoryOperationDto,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>> {
    return this.inventory.create(
      segment(organizationId),
      segment(companyId),
      command,
    );
  }
  update(
    organizationId: unknown,
    companyId: unknown,
    operationId: unknown,
    command: UpdateInventoryOperationDto,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>> {
    return this.inventory.update(
      segment(organizationId),
      segment(companyId),
      segment(operationId),
      command,
    );
  }
  post(
    organizationId: unknown,
    companyId: unknown,
    operationId: unknown,
    expectedVersion: unknown,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>> {
    if (typeof expectedVersion !== "number")
      return Promise.resolve({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "La versión no es válida.",
          requestId: null,
        },
      });
    return this.inventory.post(
      segment(organizationId),
      segment(companyId),
      segment(operationId),
      expectedVersion,
    );
  }
  reverse(
    organizationId: unknown,
    companyId: unknown,
    operationId: unknown,
    command: ReverseInventoryOperationDto,
  ): Promise<DesktopInventoryResult<InventoryOperationDetailDto>> {
    return this.inventory.reverse(
      segment(organizationId),
      segment(companyId),
      segment(operationId),
      command,
    );
  }
  private list(
    kind: "entries" | "outputs" | "operations",
    organizationId: unknown,
    companyId: unknown,
    query: unknown,
  ): Promise<DesktopInventoryResult<InventoryFlowPageDto>> {
    const context = [segment(organizationId), segment(companyId)] as const;
    const parsed = readQuery(query);
    return this.inventory[kind](context[0], context[1], parsed);
  }
}
function segment(value: unknown) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("El contexto de Inventario no es válido.");
  return value;
}
function readQuery(value: unknown): DesktopInventoryFlowQuery {
  if (typeof value !== "object" || value === null)
    throw new Error("El período de Inventario es obligatorio.");
  const query = value as DesktopInventoryFlowQuery;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(query.from) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(query.to)
  )
    throw new Error("El período de Inventario no es válido.");
  return query;
}
