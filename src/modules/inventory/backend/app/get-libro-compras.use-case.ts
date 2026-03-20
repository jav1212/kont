import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { LibroComprasRow } from '../domain/libro-compras';
import { ILibroComprasRepository } from '../domain/repository/libro-compras.repository';

interface Input { empresaId: string; periodo: string; }

export class GetLibroComprasUseCase extends UseCase<Input, LibroComprasRow[]> {
    constructor(private readonly repo: ILibroComprasRepository) { super(); }

    async execute({ empresaId, periodo }: Input): Promise<Result<LibroComprasRow[]>> {
        if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
            return Result.fail('Período inválido. Formato esperado: YYYY-MM');
        return this.repo.getLibroCompras(empresaId, periodo);
    }
}
