import { Result } from '@/src/core/domain/result';
import type { PurchaseCsvConfig, PurchaseCsvImportRow } from '../purchase-csv-import';

export type PurchaseCsvImportMode = 'draft' | 'confirm';

export interface PurchaseCsvImportBatch {
    id: string;
    companyId: string;
    fileName: string;
    companyRif: string;
    rows: PurchaseCsvImportRow[];
    config: PurchaseCsvConfig;
    status: string;
    revision: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface PurchaseCsvImportLineExecution {
    lineId: string;
    sourceRow: number;
    invoiceId?: string;
    status: 'saved' | 'confirmed' | 'error';
    error?: string;
    idempotent?: boolean;
}

export interface IPurchaseCsvImportRepository {
    /**
     * Lists persisted CSV batches available for resumption in one company.
     * @param companyId - Company whose tenant-scoped batches are requested.
     * @returns Matching staged batches or an expected persistence failure.
     */
    list(companyId: string): Promise<Result<PurchaseCsvImportBatch[]>>;
    /**
     * Restores a staged batch with its execution links and current revision.
     * @param id - Batch identifier.
     * @param companyId - Owning company identifier.
     * @returns The scoped batch, or a failure when missing or inaccessible.
     */
    get(id: string, companyId: string): Promise<Result<PurchaseCsvImportBatch>>;
    /**
     * Atomically saves a staged snapshot while preserving links to existing invoices.
     * @param input - Whitelisted snapshot; updates require the last observed revision.
     * @returns The persisted batch or a failure, including concurrent revision conflicts.
     */
    save(input: Omit<PurchaseCsvImportBatch, 'status' | 'revision' | 'createdAt' | 'updatedAt'> & { revision?: number }): Promise<Result<PurchaseCsvImportBatch>>;
    /**
     * Executes a reviewed snapshot without replacing a concurrently edited batch.
     * @param id - Batch identifier.
     * @param companyId - Owning company identifier.
     * @param mode - Requested posting mode.
     * @param revision - Revision shown in the caller's preview.
     * @returns Outcome for each selected line; expected failures are returned as Result failures.
     */
    execute(id: string, companyId: string, mode: PurchaseCsvImportMode, revision: number): Promise<Result<PurchaseCsvImportLineExecution[]>>;
}
