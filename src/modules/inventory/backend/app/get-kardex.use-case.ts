import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { KardexEntry } from '../domain/movimiento';
import { IMovimientoRepository } from '../domain/repository/movimiento.repository';

interface Input { empresaId: string; productoId: string; }

export class GetKardexUseCase extends UseCase<Input, KardexEntry[]> {
    constructor(private readonly repo: IMovimientoRepository) { super(); }

    async execute({ empresaId, productoId }: Input): Promise<Result<KardexEntry[]>> {
        return this.repo.getKardex(empresaId, productoId);
    }
}
