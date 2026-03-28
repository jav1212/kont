// Domain value object: InventoryLedgerRow
// Represents one product row in the annual inventory ledger (libro de inventarios).
export interface InventoryLedgerRow {
  id: string;
  code: string;
  name: string;
  type: string;
  measureUnit: string;
  openingQuantity: number;
  openingValue: number;
  inboundQuantity: number;
  inboundValue: number;
  outboundQuantity: number;
  outboundValue: number;
  closingQuantity: number;
  closingValue: number;
  purchasesValue: number;
}
