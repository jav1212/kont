import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Transformacion } from '../domain/transformacion';
import { ITransformacionRepository } from '../domain/repository/transformacion.repository';

interface Input { empresaId: string; }

export class GetTransformacionesUseCase extends UseCase<Input, Transformacion[]> {
    constructor(private readonly repo: ITransformacionRepository) { super(); }

    async execute({ empresaId }: Input): Promise<Result<Transformacion[]>> {
        return this.repo.findByEmpresa(empresaId);
    }
}
