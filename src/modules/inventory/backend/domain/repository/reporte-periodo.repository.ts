import { Result } from '@/src/core/domain/result';
import { ReportePeriodoRow } from '../reporte-periodo';

export interface IReportePeriodoRepository {
  getReporte(empresaId: string, periodo: string): Promise<Result<ReportePeriodoRow[]>>;
}
