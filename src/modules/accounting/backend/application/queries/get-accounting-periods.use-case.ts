// Query — retrieves all accounting periods for a company.
import { Result }             from '@/src/core/domain/result';
import { AccountingPeriod }   from '../../domain/accounting-period';
import { IPeriodRepository }  from '../../domain/repository/period.repository';

export class GetAccountingPeriodsUseCase {
    constructor(private readonly repo: IPeriodRepository) {}

    async execute(companyId: string): Promise<Result<AccountingPeriod[]>> {
        if (!companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(companyId);
    }
}
