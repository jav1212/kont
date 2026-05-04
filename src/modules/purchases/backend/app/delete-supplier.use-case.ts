// delete-supplier.use-case — removes a supplier by id.
// Role: application command handler for the Supplier domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { ISupplierRepository } from '../domain/repository/supplier.repository';

interface Input { id: string; }

export class DeleteSupplierUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: ISupplierRepository) { super(); }

    async execute(input: Input): Promise<Result<void>> {
        if (!input.id) return Result.fail('id is required');
        return this.repo.delete(input.id);
    }
}
