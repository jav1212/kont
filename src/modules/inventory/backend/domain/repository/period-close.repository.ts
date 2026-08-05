import { Result } from '@/src/core/domain/result';
import { PeriodClose } from '../period-close';

export interface IPeriodCloseRepository {
  list(companyId: string): Promise<Result<PeriodClose[]>>;
  save(input: PeriodClose): Promise<Result<PeriodClose>>;
}
