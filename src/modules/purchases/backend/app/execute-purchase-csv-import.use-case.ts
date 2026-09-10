import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import type { IPurchaseCsvImportRepository, PurchaseCsvImportLineExecution, PurchaseCsvImportMode } from '../domain/repository/purchase-csv-import.repository';

/** Executes the server-revalidated staged rows as drafts or confirmed purchases. */
export class ExecutePurchaseCsvImportUseCase extends UseCase<{ id: string; companyId: string; mode: PurchaseCsvImportMode; revision: number }, PurchaseCsvImportLineExecution[]> {
    /**
     * Creates a command/query bound to an authorized tenant repository.
     * @param repo - Staged-import persistence port with tenant isolation.
     * @returns A use case with explicit persistence dependencies.
     */
    constructor(private readonly repo: IPurchaseCsvImportRepository) { super(); }

    /**
     * Posts the reviewed revision and reports independent outcomes for its purchases.
     * @param input - Scoped batch identity, requested mode and preview revision.
     * @returns Per-row outcomes or a Result failure when the request is invalid.
     */
    async execute(input: { id: string; companyId: string; mode: PurchaseCsvImportMode; revision: number }): Promise<Result<PurchaseCsvImportLineExecution[]>> {
        if (!input.id || !input.companyId) return Result.fail('id and companyId are required');
        if (input.mode !== 'draft' && input.mode !== 'confirm') return Result.fail('Invalid import execution mode');
        if (!Number.isInteger(input.revision) || input.revision < 1) return Result.fail('Revisión de importación requerida');
        return this.repo.execute(input.id, input.companyId, input.mode, input.revision);
    }
}
