import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { normalizePurchaseCsvImport, type PurchaseCsvConfig, type PurchaseCsvImportRow } from '../domain/purchase-csv-import';
import type { IPurchaseCsvImportRepository, PurchaseCsvImportBatch } from '../domain/repository/purchase-csv-import.repository';

export interface SavePurchaseCsvImportInput { id?: string; revision?: number; companyId: string; fileName: string; companyRif: string; rows: PurchaseCsvImportRow[]; config: PurchaseCsvConfig; }

/** Persists only a validated, whitelisted CSV import snapshot. */
export class SavePurchaseCsvImportUseCase extends UseCase<SavePurchaseCsvImportInput, PurchaseCsvImportBatch> {
    /**
     * Creates a command/query bound to an authorized tenant repository.
     * @param repo - Staged-import persistence port with tenant isolation.
     * @returns A use case with explicit persistence dependencies.
     */
    constructor(private readonly repo: IPurchaseCsvImportRepository) { super(); }

    /**
     * Saves a resumable snapshot without requiring completed catalog or tax review.
     * @param input - Source rows, configuration and observed revision when updating.
     * @returns The saved batch, or validation/persistence failures represented as Result.
     */
    async execute(input: SavePurchaseCsvImportInput): Promise<Result<PurchaseCsvImportBatch>> {
        if (!input.companyId || !input.fileName?.trim()) return Result.fail('companyId and fileName are required');
        if (!Array.isArray(input.rows) || input.rows.length === 0) return Result.fail('At least one import row is required');
        if (new Set(input.rows.map(row => row.header.sourceRow)).size !== input.rows.length) return Result.fail('Las filas de cabecera deben tener identificadores únicos');
        return this.repo.save({ id: input.id ?? crypto.randomUUID(), revision: input.revision, companyId: input.companyId, fileName: input.fileName.trim(), companyRif: input.companyRif ?? '', ...normalizePurchaseCsvImport(input.config, input.rows) });
    }
}
