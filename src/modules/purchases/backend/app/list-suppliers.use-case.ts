// list-suppliers.use-case — queries all suppliers for a given company.
// Role: application query handler for the Supplier domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Supplier } from '../domain/supplier';
import { ISupplierRepository } from '../domain/repository/supplier.repository';

interface Input { companyId: string; }

export class ListSuppliersUseCase extends UseCase<Input, Supplier[]> {
    constructor(private readonly repo: ISupplierRepository) { super(); }

    async execute(input: Input): Promise<Result<Supplier[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId);
    }
}
