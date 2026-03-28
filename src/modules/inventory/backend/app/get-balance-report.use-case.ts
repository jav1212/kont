// get-balance-report.use-case — retrieves the balance (stock valuation) report for a given company and period.
// Role: application query handler for the Reports domain slice.
// Invariant: period must be in YYYY-MM format.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { BalanceReportRow } from '../domain/balance-report';
import { IBalanceReportRepository } from '../domain/repository/balance-report.repository';

interface Input { companyId: string; period: string; }

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export class GetBalanceReportUseCase extends UseCase<Input, BalanceReportRow[]> {
    constructor(private readonly repo: IBalanceReportRepository) { super(); }

    async execute(input: Input): Promise<Result<BalanceReportRow[]>> {
        if (!PERIOD_REGEX.test(input.period)) return Result.fail('Invalid period. Expected format: YYYY-MM');
        return this.repo.getReport(input.companyId, input.period);
    }
}
