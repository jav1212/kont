import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type { IPurchaseCsvImportRepository, PurchaseCsvImportBatch } from '../domain/repository/purchase-csv-import.repository';

/** Loads a staged CSV import after enforcing its company scope. */
export class GetPurchaseCsvImportUseCase extends UseCase<{ id: string; companyId: string }, PurchaseCsvImportBatch> {
    /**
     * Creates a command/query bound to an authorized tenant repository.
     * @param repo - Staged-import persistence port with tenant isolation.
     * @returns A use case with explicit persistence dependencies.
     */
    constructor(private readonly repo: IPurchaseCsvImportRepository) { super(); }

    /**
     * Restores the company-scoped batch for continued review.
     * @param input - Import and owning company identifiers.
     * @returns The batch or a Result failure for missing or inaccessible data.
     */
    async execute(input: { id: string; companyId: string }): Promise<Result<PurchaseCsvImportBatch>> {
        if (!input.id || !input.companyId) return Result.fail('id and companyId are required');
        return this.repo.get(input.id, input.companyId);
    }
}
