// Domain entity: Supplier
// Represents a purchase supplier in the inventory module.
export interface Supplier {
  id?: string;
  companyId: string;
  rif: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  active: boolean;
  /** Default calendar credit duration for future supplier invoices. */
  defaultCreditDays?: number;
  /** VAT withholding rate configured for this supplier, when applicable. */
  vatWithholdingRate?: 75 | 100 | null;
  /** Supplier tax category used by the existing ISLR retention calculator. */
  incomeTaxSupplierType?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
