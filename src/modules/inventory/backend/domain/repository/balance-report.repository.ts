// Repository interface: IBalanceReportRepository
// Domain port — infrastructure must implement this interface.
import { Result } from '@/src/core/domain/result';
import { BalanceReportRow } from '../balance-report';

export interface IBalanceReportRepository {
  getReport(companyId: string, period: string): Promise<Result<BalanceReportRow[]>>;
}
