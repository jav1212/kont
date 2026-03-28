// list-departments.use-case — queries all departments for a given company.
// Role: application query handler for the Department domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Department } from '../domain/department';
import { IDepartmentRepository } from '../domain/repository/department.repository';

interface Input { companyId: string; }

export class ListDepartmentsUseCase extends UseCase<Input, Department[]> {
    constructor(private readonly repo: IDepartmentRepository) { super(); }

    async execute(input: Input): Promise<Result<Department[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId);
    }
}
