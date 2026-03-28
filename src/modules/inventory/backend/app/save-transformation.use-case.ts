// save-transformation.use-case — records a new product transformation.
// Role: application command handler for the Transformation domain slice.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Transformation } from '../domain/transformation';
import { ITransformationRepository } from '../domain/repository/transformation.repository';

export class SaveTransformationUseCase extends UseCase<Transformation, Transformation> {
    constructor(private readonly repo: ITransformationRepository) { super(); }

    async execute(transformation: Transformation): Promise<Result<Transformation>> {
        if (!transformation.companyId) return Result.fail('companyId is required');
        return this.repo.save(transformation);
    }
}
