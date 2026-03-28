// get-purchase-ledger.use-case — retrieves the purchase ledger for a given company and period.
// Role: application query handler for the Reports domain slice.
// Invariant: period must be in YYYY-MM format.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { PurchaseLedgerRow } from '../domain/purchase-ledger';
import { IPurchaseLedgerRepository } from '../domain/repository/purchase-ledger.repository';

interface Input { companyId: string; period: string; }

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export class GetPurchaseLedgerUseCase extends UseCase<Input, PurchaseLedgerRow[]> {
    constructor(private readonly repo: IPurchaseLedgerRepository) { super(); }

    async execute(input: Input): Promise<Result<PurchaseLedgerRow[]>> {
        if (!PERIOD_REGEX.test(input.period)) return Result.fail('Invalid period. Expected format: YYYY-MM');
        return this.repo.getPurchaseLedger(input.companyId, input.period);
    }
}
