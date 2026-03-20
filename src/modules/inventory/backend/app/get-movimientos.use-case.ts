import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Movimiento } from '../domain/movimiento';
import { IMovimientoRepository } from '../domain/repository/movimiento.repository';

interface Input { empresaId: string; periodo?: string; }

export class GetMovimientosUseCase extends UseCase<Input, Movimiento[]> {
    constructor(private readonly repo: IMovimientoRepository) { super(); }

    async execute({ empresaId, periodo }: Input): Promise<Result<Movimiento[]>> {
        return this.repo.findByEmpresa(empresaId, periodo);
    }
}
