import type { CompanyId } from "@kontave/companies-domain";
import type { ProductId, UnitOfMeasure } from "@kontave/products-domain";
import { InventoryFailure } from "./inventory-failure";

export interface ReplenishmentPolicyState { readonly companyId: CompanyId; readonly productId: ProductId; readonly unit: UnitOfMeasure; readonly minimumQuantity: string | null; readonly version: number; readonly updatedAt: string }
export class ReplenishmentPolicy {
  readonly companyId:CompanyId;readonly productId:ProductId;readonly unit:UnitOfMeasure;readonly minimumQuantity:string|null;readonly version:number;readonly updatedAt:string;
  constructor(state:ReplenishmentPolicyState){if(!Number.isSafeInteger(state.version)||state.version<1||state.minimumQuantity!==null&&!validDecimal(state.minimumQuantity))throw new InventoryFailure("INVENTORY_PROFILE_INVALID","Replenishment policy is invalid.");this.companyId=state.companyId;this.productId=state.productId;this.unit=state.unit;this.minimumQuantity=state.minimumQuantity;this.version=state.version;this.updatedAt=state.updatedAt;}
}
function validDecimal(value:string){return /^\d+(?:\.\d{1,4})?$/.test(value)&&Number(value)>=0;}
