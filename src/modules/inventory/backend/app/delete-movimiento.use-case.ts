import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IMovimientoRepository } from '../domain/repository/movimiento.repository';

export class DeleteMovimientoUseCase extends UseCase<string, void> {
    constructor(private readonly repo: IMovimientoRepository) { super(); }

    async execute(id: string): Promise<Result<void>> {
        if (!id) return Result.fail('id es requerido');
        return this.repo.delete(id);
    }
}
