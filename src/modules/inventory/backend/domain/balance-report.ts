// Domain value object: BalanceReportRow
// Represents one department row in the inventory balance report.
export interface BalanceReportRow {
  departmentName: string;
  openingUnits: number;
  openingCost: number;
  inboundUnits: number;
  inboundCost: number;
  outboundUnits: number;
  outboundCost: number;
  closingUnits: number;
  closingCost: number;
}
