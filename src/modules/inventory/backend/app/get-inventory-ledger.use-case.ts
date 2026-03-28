// get-inventory-ledger.use-case — retrieves the inventory ledger for a given company and year.
// Role: application query handler for the Reports domain slice.
// Invariant: year must be between 2000 and 2100.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { InventoryLedgerRow } from '../domain/inventory-ledger';
import { IInventoryLedgerRepository } from '../domain/repository/inventory-ledger.repository';

interface Input { companyId: string; year: number; }

export class GetInventoryLedgerUseCase extends UseCase<Input, InventoryLedgerRow[]> {
    constructor(private readonly repo: IInventoryLedgerRepository) { super(); }

    async execute(input: Input): Promise<Result<InventoryLedgerRow[]>> {
        if (input.year < 2000 || input.year > 2100) return Result.fail('Invalid year');
        return this.repo.getInventoryLedger(input.companyId, input.year);
    }
}
