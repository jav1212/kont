// get-islr-report.use-case — retrieves the ISLR (income tax withholding) report for a given company and period.
// Role: application query handler for the Reports domain slice.
// Invariant: period must be in YYYY-MM format.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IslrProduct } from '../domain/islr-report';
import { IIslrReportRepository } from '../domain/repository/islr-report.repository';

interface Input { companyId: string; period: string; }

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export class GetIslrReportUseCase extends UseCase<Input, IslrProduct[]> {
    constructor(private readonly repo: IIslrReportRepository) { super(); }

    async execute(input: Input): Promise<Result<IslrProduct[]>> {
        if (!PERIOD_REGEX.test(input.period)) return Result.fail('Invalid period. Expected format: YYYY-MM');
        return this.repo.getReport(input.companyId, input.period);
    }
}
