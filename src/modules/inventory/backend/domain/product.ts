// Domain entity: Product
import type { CurrencyCode } from '../../shared/currency';
// Represents an inventory product in the system.
// ProductType, MeasureUnit, ValuationMethod, VatType values are DB enum string literals — do not change.
export type ProductType = 'mercancia';
export type MeasureUnit = 'unidad' | 'kg' | 'g' | 'm' | 'm2' | 'm3' | 'litro' | 'galon' | 'caja' | 'rollo' | 'paquete';
export type ValuationMethod = 'promedio_ponderado' | 'peps';
export type VatType = 'exento' | 'general';
export type SaleCurrency = CurrencyCode;
/** Determines whether a sellable catalog item consumes its own stock or a recipe. */
export type ProductCompositionKind = 'simple' | 'composite';

/** A resolved component of a composite product, scoped to its owning company. */
export interface ProductComponent {
  productId: string;
  quantity: number;
  code: string;
  name: string;
  measureUnit: MeasureUnit;
  currentStock: number;
  active: boolean;
}
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
  /** Defaults to simple for every existing catalog product. */
  compositionKind?: ProductCompositionKind;
  /** A composite is sellable only after at least one valid component is configured. */
  compositionStatus?: 'pending' | 'ready';
  /** Resolved recipe detail, included when the catalog is read. */
  components?: ProductComponent[];
  customFields?: Record<string, unknown>;  // sector-specific and user-defined extra data
  createdAt?: string;
  updatedAt?: string;
}
