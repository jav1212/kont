// save-department.use-case — creates or updates a department.
// Role: application command handler for the Department domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Department } from '../domain/department';
import { IDepartmentRepository } from '../domain/repository/department.repository';

export class SaveDepartmentUseCase extends UseCase<Department, Department> {
    constructor(private readonly repo: IDepartmentRepository) { super(); }

    async execute(department: Department): Promise<Result<Department>> {
        if (!department.name?.trim()) return Result.fail('Department name is required');
        return this.repo.upsert(department);
    }
}
