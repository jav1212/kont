import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Movimiento } from '../domain/movimiento';
import { IMovimientoRepository } from '../domain/repository/movimiento.repository';

interface Input { id: string; fecha: string; referencia: string; notas: string; }

export class UpdateMovimientoMetaUseCase extends UseCase<Input, Movimiento> {
    constructor(private readonly repo: IMovimientoRepository) { super(); }

    async execute(input: Input): Promise<Result<Movimiento>> {
        if (!input.id) return Result.fail('id es requerido');
        if (!input.fecha) return Result.fail('fecha es requerida');
        return this.repo.updateMeta(input.id, input.fecha, input.referencia ?? '', input.notas ?? '');
    }
}
