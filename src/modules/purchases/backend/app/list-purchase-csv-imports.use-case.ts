import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type { IPurchaseCsvImportRepository, PurchaseCsvImportBatch } from '../domain/repository/purchase-csv-import.repository';

/** Lists CSV import batches visible to a company. */
export class ListPurchaseCsvImportsUseCase extends UseCase<{ companyId: string }, PurchaseCsvImportBatch[]> {
    /**
     * Creates a command/query bound to an authorized tenant repository.
     * @param repo - Staged-import persistence port with tenant isolation.
     * @returns A use case with explicit persistence dependencies.
     */
    constructor(private readonly repo: IPurchaseCsvImportRepository) { super(); }

    /**
     * Finds persisted CSV batches that can be opened by the active company.
     * @param input - Company whose batches are requested.
     * @returns Scoped batches or expected failures represented as Result.
     */
    async execute(input: { companyId: string }): Promise<Result<PurchaseCsvImportBatch[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.list(input.companyId);
    }
}
