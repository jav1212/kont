import { Result } from '@/src/core/domain/result';
import { ReporteISLRProducto } from '../reporte-islr';

export interface IReporteISLRRepository {
  getReporte(empresaId: string, periodo: string): Promise<Result<ReporteISLRProducto[]>>;
}
