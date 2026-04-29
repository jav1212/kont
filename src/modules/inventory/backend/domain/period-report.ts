// Domain value object: PeriodReportRow
// Represents one product row in the inventory period report.
// VatType string literal values are DB enum contracts — do not change.
export type VatType = 'exento' | 'general';

export interface PeriodReportRow {
  code: string;
  name: string;
  departmentName: string;
  supplierName: string;
  vatType: VatType;
  openingInventory: number;
  averageCost: number;
  inbound: number;
  outbound: number;
  currentStock: number;
  inboundCostBs: number;
  totalOutboundNoVatBs: number;
  outboundCostBs: number;
  selfConsumptionCost: number;
  currentCostBs: number;
  vatPercentage: number;
  totalVatBs: number;                  // IVA sobre el costo de existencia (stock al cierre)
  totalWithVatBs: number;              // currentCostBs + totalVatBs
  salesWithVatBs: number;              // totalOutboundNoVatBs × (1 + vat/100) — facturación bruta de ventas
  selfConsumptionWithVatBs: number;    // selfConsumptionCost × (1 + vat/100)
}
