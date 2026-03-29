// Query — generates a trial balance report for a company, optionally scoped to a period.
// Returns one row per account with total debits, total credits, and the resulting balance.
import { Result }                                  from '@/src/core/domain/result';
import { IJournalEntryRepository, TrialBalanceLine } from '../../domain/repository/journal-entry.repository';

export interface GetTrialBalanceInput {
    companyId: string;
    periodId?: string;
}

export class GetTrialBalanceUseCase {
    constructor(private readonly repo: IJournalEntryRepository) {}

    async execute(input: GetTrialBalanceInput): Promise<Result<TrialBalanceLine[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.getTrialBalance(input.companyId, input.periodId);
    }
}
