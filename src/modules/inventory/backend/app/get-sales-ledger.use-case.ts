// get-sales-ledger.use-case — retrieves the sales ledger for a given company and period.
// Role: application query handler for the Reports domain slice.
// Invariant: period must be in YYYY-MM format.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { SalesLedgerRow } from '../domain/sales-ledger';
import { ISalesLedgerRepository } from '../domain/repository/sales-ledger.repository';

interface Input { companyId: string; period: string; }

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export class GetSalesLedgerUseCase extends UseCase<Input, SalesLedgerRow[]> {
    constructor(private readonly repo: ISalesLedgerRepository) { super(); }

    async execute(input: Input): Promise<Result<SalesLedgerRow[]>> {
        if (!PERIOD_REGEX.test(input.period)) return Result.fail('Invalid period. Expected format: YYYY-MM');
        return this.repo.getSalesLedger(input.companyId, input.period);
    }
}
