export type IvaTipo = 'exento' | 'general';

export interface ReportePeriodoRow {
  codigo: string;
  nombre: string;
  departamentoNombre: string;
  proveedorNombre: string;
  ivaTipo: IvaTipo;
  inventarioInicial: number;
  costoFactura: number;
  costoTotal: number;
  costoPromedio: number;
  entradas: number;
  salidas: number;
  existenciaActual: number;
  costoEntradasBs: number;
  totalSalidasSIvaBs: number;
  costoSalidasBs: number;
  costoAutoconsumo: number;
  costoActualBs: number;
  ivaPorcentaje: number;
  totalIvaBs: number;
  totalConIvaBs: number;
}
