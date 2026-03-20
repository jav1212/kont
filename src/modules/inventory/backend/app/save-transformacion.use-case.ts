import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Transformacion } from '../domain/transformacion';
import { ITransformacionRepository } from '../domain/repository/transformacion.repository';

export class SaveTransformacionUseCase extends UseCase<Transformacion, Transformacion> {
    constructor(private readonly repo: ITransformacionRepository) { super(); }

    async execute(transformacion: Transformacion): Promise<Result<Transformacion>> {
        if (!transformacion.empresaId) return Result.fail('empresa_id es requerido');
        return this.repo.save(transformacion);
    }
}
