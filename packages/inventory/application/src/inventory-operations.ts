import type { CompanyId } from "@kontave/companies-domain";
import type { OrganizationId, UserId } from "@kontave/organizations-domain";
import { InventoryFailure, type InventoryOperationReason, type InventoryOperationStatus } from "@kontave/inventory-domain";
import type { UnitOfMeasure } from "@kontave/products-domain";
type InventoryUnit=`${UnitOfMeasure}`;

export type InventoryFlowDirection = "inbound" | "outbound";
export type InventoryOperationSourceKind = "purchasing" | "sales" | "inventory" | "production" | "migration";

export interface InventoryFlowQuery {
  readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly companyId: CompanyId;
  readonly from: string; readonly to: string; readonly direction?: InventoryFlowDirection;
  readonly reason?: InventoryOperationReason; readonly sourceKind?: InventoryOperationSourceKind;
  readonly productId?: string; readonly status?: InventoryOperationStatus; readonly search?: string;
  readonly cursor?: string; readonly limit: number;
}
export interface InventoryFlowItem {
  readonly id: string; readonly operationId: string; readonly effectiveDate: string;
  readonly direction: InventoryFlowDirection; readonly reason: InventoryOperationReason; readonly status: InventoryOperationStatus;
  readonly product: { readonly id: string; readonly sku: string; readonly name: string };
  readonly quantity: { readonly value: string; readonly unit: InventoryUnit };
  readonly unitCost: { readonly amount: string; readonly currency: "VES" } | null;
  readonly totalCost: { readonly amount: string; readonly currency: "VES" } | null;
  readonly source: { readonly kind: InventoryOperationSourceKind; readonly documentId: string };
  readonly reference: string | null; readonly notes: string | null; readonly postedAt: string | null;
}
export interface InventoryFlowPage {
  readonly items: readonly InventoryFlowItem[]; readonly nextCursor: string | null; readonly total: number;
  readonly summary: { readonly movementCount: number; readonly totalValue: { readonly amount: string; readonly currency: "VES" }; readonly quantities: readonly { readonly unit: InventoryUnit; readonly value: string }[] };
}
export interface InventoryOperationDetail {
  readonly id: string; readonly companyId: string; readonly reason: InventoryOperationReason;
  readonly effectiveDate: string; readonly status: InventoryOperationStatus; readonly version: number;
  readonly source: { readonly kind: InventoryOperationSourceKind; readonly documentId: string };
  readonly reference: string | null; readonly notes: string | null; readonly postedAt: string | null;
  readonly reversalOf: string | null; readonly reversedBy: string | null;
  readonly lines: readonly { readonly id: string; readonly productId: string; readonly productName: string; readonly productSku: string; readonly direction: InventoryFlowDirection; readonly quantity: { readonly value: string; readonly unit: InventoryUnit }; readonly unitCost: { readonly amount: string; readonly currency: "VES" } | null; readonly movementId: string | null }[];
  readonly capabilities: { readonly canPost: boolean; readonly canReverse: boolean; readonly canEditMetadata: boolean };
}
export interface CreateInventoryOperationInput {
  readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly companyId: CompanyId;
  readonly reason: InventoryOperationReason; readonly effectiveDate: string; readonly reference?: string | null; readonly notes?: string | null;
  readonly lines: readonly { readonly productId: string; readonly direction: InventoryFlowDirection; readonly quantity: string; readonly unit: InventoryUnit; readonly unitCost?: string | null }[];
}
export interface InventoryOperationCommand { readonly actorUserId: UserId; readonly organizationId: OrganizationId; readonly companyId: CompanyId; readonly operationId: string; readonly expectedVersion: number }
export interface UpdateInventoryOperationInput extends InventoryOperationCommand { readonly effectiveDate?: string; readonly reference?: string|null; readonly notes?: string|null }
export interface ReverseInventoryOperationCommand extends InventoryOperationCommand { readonly effectiveDate: string; readonly reason: string }

export interface InventoryOperationsRepository {
  list(query: InventoryFlowQuery): Promise<InventoryFlowPage>;
  get(input: Omit<InventoryOperationCommand, "expectedVersion">): Promise<InventoryOperationDetail>;
  create(input: CreateInventoryOperationInput): Promise<InventoryOperationDetail>;
  update(input: UpdateInventoryOperationInput): Promise<InventoryOperationDetail>;
  post(input: InventoryOperationCommand): Promise<InventoryOperationDetail>;
  reverse(input: ReverseInventoryOperationCommand): Promise<InventoryOperationDetail>;
}
export class ListInventoryFlows { constructor(private readonly repository: InventoryOperationsRepository) {} execute(query: InventoryFlowQuery) { return this.repository.list(validateQuery(query)); } }
export class GetInventoryOperation { constructor(private readonly repository: InventoryOperationsRepository) {} execute(input: Omit<InventoryOperationCommand,"expectedVersion">) { return this.repository.get(input); } }
export class CreateInventoryOperation { constructor(private readonly repository: InventoryOperationsRepository) {} execute(input: CreateInventoryOperationInput) { validateCreate(input); return this.repository.create(input); } }
export class UpdateInventoryOperation { constructor(private readonly repository: InventoryOperationsRepository) {} execute(input: UpdateInventoryOperationInput) { validateVersion(input.expectedVersion);if(input.effectiveDate!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate))throw invalid("Operation effective date is invalid.");return this.repository.update(input); } }
export class PostInventoryOperation { constructor(private readonly repository: InventoryOperationsRepository) {} execute(input: InventoryOperationCommand) { validateVersion(input.expectedVersion); return this.repository.post(input); } }
export class ReverseInventoryOperation { constructor(private readonly repository: InventoryOperationsRepository) {} execute(input: ReverseInventoryOperationCommand) { validateVersion(input.expectedVersion); if (!input.reason.trim()) throw invalid("Reversal reason is required."); return this.repository.reverse(input); } }

function validateQuery(query: InventoryFlowQuery): InventoryFlowQuery { if (!/^\d{4}-\d{2}-\d{2}$/.test(query.from)||!/^\d{4}-\d{2}-\d{2}$/.test(query.to)||query.from>query.to) throw invalid("Inventory flow period is invalid."); if(!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>100)throw invalid("Inventory flow limit must be between 1 and 100."); const {search:rawSearch,...rest}=query,search=rawSearch?.trim();return search?{...rest,search}:rest; }
function validateCreate(input: CreateInventoryOperationInput): void { if(!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)||input.lines.length<1||input.lines.length>100)throw invalid("Inventory operation payload is invalid."); if(!["stock_count_adjustment","self_consumption","opening_balance"].includes(input.reason))throw invalid("This operation must be created by its owning capability."); for(const line of input.lines){if(!/^\d+(?:\.\d{1,4})?$/.test(line.quantity)||Number(line.quantity)<=0)throw invalid("Operation quantities must be positive decimals.");if(input.reason==="self_consumption"&&line.direction!=="outbound"||input.reason==="opening_balance"&&line.direction!=="inbound")throw invalid("Operation direction does not match its reason.");} }
function validateVersion(version:number):void{if(!Number.isSafeInteger(version)||version<1)throw invalid("expectedVersion is invalid.");}
function invalid(message:string){return new InventoryFailure("INVENTORY_OPERATION_INVALID",message);}
