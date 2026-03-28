// Domain value object: SalesLedgerRow
// Represents one row in the fiscal sales ledger (libro de ventas).
// The 'tipo' field uses DB string literal values — do not change.
export interface SalesLedgerRow {
  id: string;
  date: string;
  invoiceNumber: string;
  clientRif: string;
  clientName: string;
  exemptBase: number;
  taxableBase8: number;
  iva8: number;
  taxableBase16: number;
  iva16: number;
  selfConsumption: number;
  selfConsumptionVat: number;
  total: number;
  tipo: 'venta' | 'autoconsumo';
}
