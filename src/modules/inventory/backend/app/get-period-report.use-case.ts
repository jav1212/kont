// get-period-report.use-case — retrieves the inventory period report for a given company and period.
// Role: application query handler for the Reports domain slice.
// Invariant: period must be in YYYY-MM format.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { PeriodReportRow } from '../domain/period-report';
import { IPeriodReportRepository } from '../domain/repository/period-report.repository';

interface Input { companyId: string; period: string; }

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export class GetPeriodReportUseCase extends UseCase<Input, PeriodReportRow[]> {
    constructor(private readonly repo: IPeriodReportRepository) { super(); }

    async execute(input: Input): Promise<Result<PeriodReportRow[]>> {
        if (!PERIOD_REGEX.test(input.period)) return Result.fail('Invalid period. Expected format: YYYY-MM');
        return this.repo.getReport(input.companyId, input.period);
    }
}
