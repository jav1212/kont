import type { CompanyId } from "@kontave/companies/domain";
import {
  InventoryFailure,
  type InventoryOperationReason,
  type InventoryOperationStatus,
} from "@kontave/inventory-domain";
import type { OrganizationId, UserId } from "@kontave/organizations/domain";
import type { UnitOfMeasure } from "@kontave/products-domain";

type InventoryUnit = `${UnitOfMeasure}`;

/** Direction in which an inventory effect changes on-hand stock. */
export type InventoryFlowDirection = "inbound" | "outbound";

/** Bounded contexts allowed to own inventory operations. */
export type InventoryOperationSourceKind =
  | "purchasing"
  | "sales"
  | "inventory"
  | "production"
  | "migration";

/** Tenant scope, filters and cursor settings for inventory flows. */
export interface InventoryFlowQuery {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly from: string;
  readonly to: string;
  readonly direction?: InventoryFlowDirection;
  readonly reason?: InventoryOperationReason;
  readonly sourceKind?: InventoryOperationSourceKind;
  readonly productId?: string;
  readonly status?: InventoryOperationStatus;
  readonly search?: string;
  readonly cursor?: string;
  readonly limit: number;
}

/** One flattened stock effect projected for inventory-flow presentation. */
export interface InventoryFlowItem {
  readonly id: string;
  readonly operationId: string;
  readonly effectiveDate: string;
  readonly direction: InventoryFlowDirection;
  readonly reason: InventoryOperationReason;
  readonly status: InventoryOperationStatus;
  readonly product: { readonly id: string; readonly sku: string; readonly name: string };
  readonly quantity: { readonly value: string; readonly unit: InventoryUnit };
  readonly unitCost: { readonly amount: string; readonly currency: "VES" } | null;
  readonly totalCost: { readonly amount: string; readonly currency: "VES" } | null;
  readonly source: { readonly kind: InventoryOperationSourceKind; readonly documentId: string };
  readonly reference: string | null;
  readonly notes: string | null;
  readonly postedAt: string | null;
}

/** Cursor page of inventory effects and aggregate flow totals. */
export interface InventoryFlowPage {
  readonly items: readonly InventoryFlowItem[];
  readonly nextCursor: string | null;
  readonly total: number;
  readonly summary: {
    readonly movementCount: number;
    readonly totalValue: { readonly amount: string; readonly currency: "VES" };
    readonly quantities: readonly { readonly unit: InventoryUnit; readonly value: string }[];
  };
}

/** Complete inventory operation projected for native clients. */
export interface InventoryOperationDetail {
  readonly id: string;
  readonly companyId: string;
  readonly reason: InventoryOperationReason;
  readonly effectiveDate: string;
  readonly status: InventoryOperationStatus;
  readonly version: number;
  readonly source: { readonly kind: InventoryOperationSourceKind; readonly documentId: string };
  readonly reference: string | null;
  readonly notes: string | null;
  readonly postedAt: string | null;
  readonly reversalOf: string | null;
  readonly reversedBy: string | null;
  readonly lines: readonly {
    readonly id: string;
    readonly productId: string;
    readonly productName: string;
    readonly productSku: string;
    readonly direction: InventoryFlowDirection;
    readonly quantity: { readonly value: string; readonly unit: InventoryUnit };
    readonly unitCost: { readonly amount: string; readonly currency: "VES" } | null;
    readonly movementId: string | null;
  }[];
  readonly capabilities: {
    readonly canPost: boolean;
    readonly canReverse: boolean;
    readonly canEditMetadata: boolean;
  };
}

/** Input for a manually owned inventory operation. */
export interface CreateInventoryOperationInput {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly reason: InventoryOperationReason;
  readonly effectiveDate: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
  readonly lines: readonly {
    readonly productId: string;
    readonly direction: InventoryFlowDirection;
    readonly quantity: string;
    readonly unit: InventoryUnit;
    readonly unitCost?: string | null;
  }[];
}

/** Scope, operation identity and optimistic version for state transitions. */
export interface InventoryOperationCommand {
  readonly actorUserId: UserId;
  readonly organizationId: OrganizationId;
  readonly companyId: CompanyId;
  readonly operationId: string;
  readonly expectedVersion: number;
}

/** Editable metadata for a draft inventory operation. */
export interface UpdateInventoryOperationInput extends InventoryOperationCommand {
  readonly effectiveDate?: string;
  readonly reference?: string | null;
  readonly notes?: string | null;
}

/** Command for reversing a posted inventory operation. */
export interface ReverseInventoryOperationCommand extends InventoryOperationCommand {
  readonly effectiveDate: string;
  readonly reason: string;
}

/** Persistence and query port owned by inventory operation application services. */
export interface InventoryOperationsRepository {
  /** @returns A cursor page of inventory effects. */
  list(query: InventoryFlowQuery): Promise<InventoryFlowPage>;
  /** @returns The requested inventory operation detail. */
  get(input: Omit<InventoryOperationCommand, "expectedVersion">): Promise<InventoryOperationDetail>;
  /** @returns The authoritative newly-created draft operation. */
  create(input: CreateInventoryOperationInput): Promise<InventoryOperationDetail>;
  /** @returns The authoritative updated draft operation. */
  update(input: UpdateInventoryOperationInput): Promise<InventoryOperationDetail>;
  /** @returns The authoritative posted operation. */
  post(input: InventoryOperationCommand): Promise<InventoryOperationDetail>;
  /** @returns The authoritative reversal operation. */
  reverse(input: ReverseInventoryOperationCommand): Promise<InventoryOperationDetail>;
}

/** Lists inventory effects using validated period and cursor filters. */
export class ListInventoryFlows {
  /** @param repository - Inventory operations query port. */
  constructor(private readonly repository: InventoryOperationsRepository) {}

  /**
   * @param query - Tenant scope, period, filters and cursor settings.
   * @returns A cursor page of inventory effects.
   * @throws {InventoryFailure} When validation or persistence fails.
   */
  execute(query: InventoryFlowQuery): Promise<InventoryFlowPage> {
    const valid = validateQuery(query);
    return inventoryCall(() => this.repository.list(valid));
  }
}

/** Retrieves one inventory operation. */
export class GetInventoryOperation {
  /** @param repository - Inventory operations persistence port. */
  constructor(private readonly repository: InventoryOperationsRepository) {}

  /**
   * @param input - Tenant scope and operation identity.
   * @returns Complete inventory operation detail.
   * @throws {InventoryFailure} When persistence fails.
   */
  execute(
    input: Omit<InventoryOperationCommand, "expectedVersion">,
  ): Promise<InventoryOperationDetail> {
    return inventoryCall(() => this.repository.get(input));
  }
}

/** Creates a draft operation only for inventory-owned manual reasons. */
export class CreateInventoryOperation {
  /** @param repository - Inventory operations persistence port. */
  constructor(private readonly repository: InventoryOperationsRepository) {}

  /**
   * @param input - Operation reason, effective date and stock-effect lines.
   * @returns The authoritative draft operation.
   * @throws {InventoryFailure} When ownership, payload or persistence fails.
   */
  execute(input: CreateInventoryOperationInput): Promise<InventoryOperationDetail> {
    validateCreate(input);
    return inventoryCall(() => this.repository.create(input));
  }
}

/** Updates metadata of a draft inventory operation using optimistic concurrency. */
export class UpdateInventoryOperation {
  /** @param repository - Inventory operations persistence port. */
  constructor(private readonly repository: InventoryOperationsRepository) {}

  /**
   * @param input - Operation identity, optional metadata and expected version.
   * @returns The authoritative updated operation.
   * @throws {InventoryFailure} When validation, concurrency or persistence fails.
   */
  execute(input: UpdateInventoryOperationInput): Promise<InventoryOperationDetail> {
    validateVersion(input.expectedVersion);
    if (input.effectiveDate !== undefined) validateOperationDate(input.effectiveDate);
    return inventoryCall(() => this.repository.update(input));
  }
}

/** Posts a draft inventory operation using optimistic concurrency. */
export class PostInventoryOperation {
  /** @param repository - Inventory operations persistence port. */
  constructor(private readonly repository: InventoryOperationsRepository) {}

  /**
   * @param input - Operation identity, scope and expected version.
   * @returns The authoritative posted operation.
   * @throws {InventoryFailure} When validation, transition, concurrency or persistence fails.
   */
  execute(input: InventoryOperationCommand): Promise<InventoryOperationDetail> {
    validateVersion(input.expectedVersion);
    return inventoryCall(() => this.repository.post(input));
  }
}

/** Reverses a posted inventory operation with an explicit audit reason. */
export class ReverseInventoryOperation {
  /** @param repository - Inventory operations persistence port. */
  constructor(private readonly repository: InventoryOperationsRepository) {}

  /**
   * @param input - Operation identity, reversal date, reason and expected version.
   * @returns The authoritative reversal operation.
   * @throws {InventoryFailure} When validation, transition, concurrency or persistence fails.
   */
  execute(input: ReverseInventoryOperationCommand): Promise<InventoryOperationDetail> {
    validateVersion(input.expectedVersion);
    validateOperationDate(input.effectiveDate);
    if (!input.reason.trim()) throw invalid("Reversal reason is required.");
    return inventoryCall(() => this.repository.reverse(input));
  }
}

function validateQuery(query: InventoryFlowQuery): InventoryFlowQuery {
  validateOperationDate(query.from);
  validateOperationDate(query.to);
  if (query.from > query.to) throw invalid("Inventory flow period is invalid.");
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
    throw invalid("Inventory flow limit must be between 1 and 100.");
  }
  const { search: rawSearch, ...rest } = query;
  const search = rawSearch?.trim();
  return search ? { ...rest, search } : rest;
}

function validateCreate(input: CreateInventoryOperationInput): void {
  validateOperationDate(input.effectiveDate);
  if (input.lines.length < 1 || input.lines.length > 100) {
    throw invalid("Inventory operation payload is invalid.");
  }
  if (!["stock_count_adjustment", "self_consumption", "opening_balance"].includes(input.reason)) {
    throw invalid("This operation must be created by its owning capability.");
  }
  for (const line of input.lines) {
    if (!/^\d+(?:\.\d{1,4})?$/.test(line.quantity) || Number(line.quantity) <= 0) {
      throw invalid("Operation quantities must be positive decimals.");
    }
    if (
      (input.reason === "self_consumption" && line.direction !== "outbound")
      || (input.reason === "opening_balance" && line.direction !== "inbound")
    ) {
      throw invalid("Operation direction does not match its reason.");
    }
  }
}

function validateOperationDate(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalid("Operation effective date is invalid.");
  }
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw invalid("Operation effective date is invalid.");
  }
}

function validateVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1) throw invalid("expectedVersion is invalid.");
}

function invalid(message: string): InventoryFailure {
  return new InventoryFailure("INVENTORY_OPERATION_INVALID", message);
}

async function inventoryCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause: unknown) {
    if (cause instanceof InventoryFailure) throw cause;
    throw new InventoryFailure(
      "INVENTORY_REPOSITORY_UNAVAILABLE",
      "Inventory repository is unavailable.",
      { cause },
    );
  }
}
