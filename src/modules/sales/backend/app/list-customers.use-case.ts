import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Customer } from '../domain/customer';
import { ICustomerRepository } from '../domain/repository/customer.repository';

interface Input { companyId: string; }

export class ListCustomersUseCase extends UseCase<Input, Customer[]> {
    constructor(private readonly repo: ICustomerRepository) { super(); }
    async execute(input: Input): Promise<Result<Customer[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId);
    }
}
