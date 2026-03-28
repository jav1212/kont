// Domain entity: Product
// Represents an inventory product in the system.
// ProductType, MeasureUnit, ValuationMethod, VatType values are DB enum string literals — do not change.
export type ProductType = 'mercancia' | 'materia_prima' | 'producto_terminado';
export type MeasureUnit = 'unidad' | 'kg' | 'g' | 'm' | 'm2' | 'm3' | 'litro' | 'caja' | 'rollo' | 'paquete';
export type ValuationMethod = 'promedio_ponderado' | 'peps';
export type VatType = 'exento' | 'general';

export interface Product {
  id?: string;
  companyId: string;
  code: string;
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
  createdAt?: string;
  updatedAt?: string;
}
