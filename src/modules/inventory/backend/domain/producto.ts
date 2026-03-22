export type TipoProducto = 'mercancia' | 'materia_prima' | 'producto_terminado';
export type UnidadMedida = 'unidad' | 'kg' | 'g' | 'm' | 'm2' | 'm3' | 'litro' | 'caja' | 'rollo' | 'paquete';
export type MetodoValuacion = 'promedio_ponderado' | 'peps';
export type IvaTipo = 'exento' | 'general';

export interface Producto {
  id?: string;
  empresaId: string;
  codigo: string;
  nombre: string;
  descripcion: string;
  tipo: TipoProducto;
  unidadMedida: UnidadMedida;
  metodoValuacion: MetodoValuacion;
  existenciaActual: number;
  costoPromedio: number;
  activo: boolean;
  departamentoId?: string;
  departamentoNombre?: string;
  ivaTipo: IvaTipo;
  createdAt?: string;
  updatedAt?: string;
}
