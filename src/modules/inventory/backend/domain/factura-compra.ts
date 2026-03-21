export type IvaAlicuota = 'exenta' | 'reducida_8' | 'general_16';
export type MonedaItem = 'B' | 'D';

export interface FacturaCompraItem {
  id?: string;
  facturaId?: string;
  productoId: string;
  productoNombre?: string;
  cantidad: number;
  costoUnitario: number;   // siempre en Bs (canónico)
  costoTotal: number;      // siempre en Bs
  ivaAlicuota: IvaAlicuota;
  moneda: MonedaItem;      // moneda original de la factura del proveedor
  costoMoneda?: number | null; // costo en la moneda original (USD si moneda='D')
  tasaDolar?: number | null;   // tasa BCV usada para la conversión
}

export type EstadoFactura = 'borrador' | 'confirmada';

export interface FacturaCompra {
  id?: string;
  empresaId: string;
  proveedorId: string;
  proveedorNombre?: string;
  numeroFactura: string;
  numeroControl?: string;
  fecha: string;       // YYYY-MM-DD
  periodo: string;     // YYYY-MM
  estado: EstadoFactura;
  subtotal: number;
  ivaPorcentaje: number;
  ivaMonto: number;
  total: number;
  notas: string;
  confirmadaAt?: string | null;
  items?: FacturaCompraItem[];
  createdAt?: string;
  updatedAt?: string;
}
