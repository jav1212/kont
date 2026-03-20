import { Result } from '@/src/core/domain/result';
import { LibroVentasRow } from '../libro-ventas';

export interface ILibroVentasRepository {
  getLibroVentas(empresaId: string, periodo: string): Promise<Result<LibroVentasRow[]>>;
}
