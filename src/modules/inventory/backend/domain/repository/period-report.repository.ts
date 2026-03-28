// Repository interface: IPeriodReportRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { PeriodReportRow } from '../period-report';

export interface IPeriodReportRepository {
  getReport(companyId: string, period: string): Promise<Result<PeriodReportRow[]>>;
}
