import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { ICustomerRepository } from '../domain/repository/customer.repository';

interface Input { id: string; }

export class DeleteCustomerUseCase extends UseCase<Input, { softDeleted: boolean }> {
    constructor(private readonly repo: ICustomerRepository) { super(); }
    async execute(input: Input): Promise<Result<{ softDeleted: boolean }>> {
        if (!input.id) return Result.fail('id is required');
        return this.repo.delete(input.id);
    }
}
