import { Result } from '@/src/core/domain/result';
import { ReporteSaldoRow } from '../reporte-saldo';

export interface IReporteSaldoRepository {
  getReporte(empresaId: string, periodo: string): Promise<Result<ReporteSaldoRow[]>>;
}
