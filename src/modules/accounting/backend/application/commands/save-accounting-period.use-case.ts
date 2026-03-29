// Application layer — creates or updates an accounting period.
// Validates date ordering and that the period is associated with a company.
import { Result }                              from '@/src/core/domain/result';
import { IPeriodRepository, SavePeriodInput }  from '../../domain/repository/period.repository';

export class SaveAccountingPeriodUseCase {
    constructor(private readonly repo: IPeriodRepository) {}

    async execute(input: SavePeriodInput): Promise<Result<string>> {
        if (!input.companyId)      return Result.fail('companyId is required');
        if (!input.name.trim())    return Result.fail('Period name is required');
        if (!input.startDate)      return Result.fail('startDate is required');
        if (!input.endDate)        return Result.fail('endDate is required');
        if (input.startDate >= input.endDate) {
            return Result.fail('startDate must be before endDate');
        }
        return this.repo.save(input);
    }
}
