// Application layer — closes an accounting period, making it immutable.
// Closing is irreversible through the normal flow; re-opening requires explicit admin action.
import { Result }             from '@/src/core/domain/result';
import { IPeriodRepository }  from '../../domain/repository/period.repository';

export class CloseAccountingPeriodUseCase {
    constructor(private readonly repo: IPeriodRepository) {}

    async execute(periodId: string): Promise<Result<void>> {
        if (!periodId) return Result.fail('periodId is required');
        return this.repo.close(periodId);
    }
}
