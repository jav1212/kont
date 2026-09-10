import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type { IPurchaseCsvImportRepository, PurchaseCsvImportBatch } from '../domain/repository/purchase-csv-import.repository';

/** Restores a linked purchase's import context; writes recheck eligibility under lock. */
export class GetPurchaseCsvImportByInvoiceUseCase extends UseCase<{ invoiceId: string; companyId: string }, PurchaseCsvImportBatch> {
    /**
     * Binds source lookup to the authorized tenant's import repository.
     * @param repo - Tenant-bound staged-import persistence port.
     * @returns A query with explicit persistence dependencies.
     */
    constructor(private readonly repo: IPurchaseCsvImportRepository) { super(); }

    /**
     * Retrieves the latest linked source without exposing sibling purchases.
     * @param input - Invoice and owning company identifiers.
     * @returns Its one-row import snapshot or an expected Result failure.
     */
    async execute(input: { invoiceId: string; companyId: string }): Promise<Result<PurchaseCsvImportBatch>> {
        if (!input.invoiceId || !input.companyId) return Result.fail('invoiceId and companyId are required');
        return this.repo.getByInvoice(input.invoiceId, input.companyId);
    }
}
