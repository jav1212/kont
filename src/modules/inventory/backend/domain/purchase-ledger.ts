// Domain value object: PurchaseLedgerRow
// Represents one row in the fiscal purchase ledger (libro de compras).
export interface PurchaseLedgerRow {
  id: string;
  date: string;
  invoiceNumber: string;
  controlNumber: string;
  supplierRif: string;
  supplierName: string;
  exemptBase: number;
  taxableBase8: number;
  iva8: number;
  taxableBase16: number;
  iva16: number;
  total: number;
}
