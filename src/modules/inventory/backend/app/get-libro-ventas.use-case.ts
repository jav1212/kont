import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { LibroVentasRow } from '../domain/libro-ventas';
import { ILibroVentasRepository } from '../domain/repository/libro-ventas.repository';

interface Input { empresaId: string; periodo: string; }

export class GetLibroVentasUseCase extends UseCase<Input, LibroVentasRow[]> {
    constructor(private readonly repo: ILibroVentasRepository) { super(); }

    async execute({ empresaId, periodo }: Input): Promise<Result<LibroVentasRow[]>> {
        if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
            return Result.fail('Período inválido. Formato esperado: YYYY-MM');
        return this.repo.getLibroVentas(empresaId, periodo);
    }
}
