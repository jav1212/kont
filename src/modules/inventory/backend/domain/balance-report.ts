// Domain value object: BalanceReportRow
// Represents one department row in the inventory balance report.
//
// salesValueWithoutVat: suma de precio_venta_unitario × cantidad sobre
// salidas y autoconsumo del período (sin IVA). Se distingue de outboundCost
// porque outboundCost es a costo (COGS) mientras que este campo es a precio
// de venta — la diferencia entre ambos es el margen bruto del departamento.
export interface BalanceReportRow {
  departmentName: string;
  openingUnits: number;
  openingCost: number;
  inboundUnits: number;
  inboundCost: number;
  outboundUnits: number;
  outboundCost: number;
  salesValueWithoutVat: number;
  closingUnits: number;
  closingCost: number;
}
