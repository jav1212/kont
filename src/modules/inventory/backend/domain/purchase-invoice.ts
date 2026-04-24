// Domain entity: PurchaseInvoice
// Represents a supplier purchase invoice with line items.
// VatRate, ItemCurrency, InvoiceStatus string literal values are DB contracts — do not change.
export type VatRate = 'exenta' | 'reducida_8' | 'general_16';
export type ItemCurrency = 'B' | 'D';

export interface PurchaseInvoiceItem {
  id?: string;
  invoiceId?: string;
  productId: string;
  productName?: string;
  quantity: number;
  unitCost: number;    // always in Bs (canonical)
  totalCost: number;   // always in Bs
  vatRate: VatRate;
  currency: ItemCurrency;    // original currency of the supplier invoice
  currencyCost?: number | null; // cost in original currency (USD if currency='D')
  dollarRate?: number | null;   // BCV rate used for conversion
}

export type InvoiceStatus = 'borrador' | 'confirmada';

export interface PurchaseInvoice {
  id?: string;
  companyId: string;
  supplierId: string;
  supplierName?: string;
  invoiceNumber: string;
  controlNumber?: string;
  date: string;       // YYYY-MM-DD
  period: string;     // YYYY-MM
  status: InvoiceStatus;
  subtotal: number;
  vatPercentage: number;
  vatAmount: number;
  total: number;
  notes: string;
  /**
   * Header-level BCV rate the user locked in for this invoice — drives the
   * USD→Bs conversion for every `currency='D'` line item. Nullable for legacy
   * invoices saved before migration 068 and for all-Bs invoices.
   */
  dollarRate?: number | null;
  /**
   * Decimal precision the user chose for the BCV rate. Persisted so the edit
   * modal can restore the exact display (e.g. `414.0500` vs `414.05`) when
   * the accountant reopens the invoice. Nullable for legacy invoices.
   */
  rateDecimals?: number | null;
  confirmedAt?: string | null;
  items?: PurchaseInvoiceItem[];
  createdAt?: string;
  updatedAt?: string;
}
