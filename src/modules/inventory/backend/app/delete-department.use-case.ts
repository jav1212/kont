// delete-department.use-case — removes a department by id.
// Role: application command handler for the Department domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IDepartmentRepository } from '../domain/repository/department.repository';

interface Input { id: string; }

export class DeleteDepartmentUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IDepartmentRepository) { super(); }

    async execute(input: Input): Promise<Result<void>> {
        if (!input.id) return Result.fail('id is required');
        return this.repo.delete(input.id);
    }
}
