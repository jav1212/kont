// save-supplier.use-case — creates or updates a supplier.
// Role: application command handler for the Supplier domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Supplier } from '../domain/supplier';
import { ISupplierRepository } from '../domain/repository/supplier.repository';

export class SaveSupplierUseCase extends UseCase<Supplier, Supplier> {
    constructor(private readonly repo: ISupplierRepository) { super(); }

    async execute(supplier: Supplier): Promise<Result<Supplier>> {
        if (!supplier.name?.trim()) return Result.fail('Supplier name is required');
        if (!supplier.companyId) return Result.fail('companyId is required');
        return this.repo.upsert(supplier);
    }
}
