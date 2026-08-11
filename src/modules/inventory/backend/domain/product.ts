// Domain entity: Product
import type { CurrencyCode } from '../../shared/currency';
// Represents an inventory product in the system.
// ProductType, MeasureUnit, ValuationMethod, VatType values are DB enum string literals — do not change.
export type ProductType = 'mercancia';
export type MeasureUnit = 'unidad' | 'kg' | 'g' | 'm' | 'm2' | 'm3' | 'litro' | 'caja' | 'rollo' | 'paquete';
export type ValuationMethod = 'promedio_ponderado' | 'peps';
export type VatType = 'exento' | 'general';
export type SaleCurrency = CurrencyCode;
export type SalePricing =
  | { mode: 'fixed'; amount: number; currency: SaleCurrency }
  | { mode: 'markup'; percentage: number; currency: SaleCurrency };

export interface Product {
  id?: string;
  companyId: string;
  code: string;
  /** Optional scanner-facing identifier. Stored as text to preserve leading zeroes. */
  barcode?: string;
  name: string;
  description: string;
  type: ProductType;
  measureUnit: MeasureUnit;
  valuationMethod: ValuationMethod;
  currentStock: number;
  averageCost: number;
  active: boolean;
  departmentId?: string;
  departmentName?: string;
  vatType: VatType;
  salePricing?: SalePricing;
  customFields?: Record<string, unknown>;  // sector-specific and user-defined extra data
  createdAt?: string;
  updatedAt?: string;
}
