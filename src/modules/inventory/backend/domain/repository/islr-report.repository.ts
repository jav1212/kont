// Repository interface: IIslrReportRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { IslrProduct } from '../islr-report';

export interface IIslrReportRepository {
  getReport(companyId: string, period: string): Promise<Result<IslrProduct[]>>;
}
