// Domain entity: Transformation
// Represents a production transformation: consumes raw materials to produce a finished product.
export interface TransformationInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface Transformation {
  id?: string;
  companyId: string;
  description: string;
  date: string;
  period: string;
  finishedProductId: string | null;
  producedQuantity: number;
  notes: string;
  inputs?: TransformationInput[];
  createdAt?: string;
}

// PeriodClose represents a closed accounting period.
export interface PeriodClose {
  id?: string;
  companyId: string;
  period: string;
  closedAt?: string;
  notes: string;
  dollarRate?: number | null;
}
