// list-transformations.use-case — queries all transformations for a given company.
// Role: application query handler for the Transformation domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Transformation } from '../domain/transformation';
import { ITransformationRepository } from '../domain/repository/transformation.repository';

interface Input { companyId: string; }

export class ListTransformationsUseCase extends UseCase<Input, Transformation[]> {
    constructor(private readonly repo: ITransformationRepository) { super(); }

    async execute(input: Input): Promise<Result<Transformation[]>> {
        if (!input.companyId) return Result.fail('companyId is required');
        return this.repo.findByCompany(input.companyId);
    }
}
