import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Customer } from '../domain/customer';
import { ICustomerRepository } from '../domain/repository/customer.repository';

export class SaveCustomerUseCase extends UseCase<Customer, Customer> {
    constructor(private readonly repo: ICustomerRepository) { super(); }
    async execute(input: Customer): Promise<Result<Customer>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!input.rif) return Result.fail('RIF is required');
        if (!input.name) return Result.fail('Name is required');
        return this.repo.save(input);
    }
}
