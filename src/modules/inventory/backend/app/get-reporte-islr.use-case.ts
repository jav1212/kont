import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { ReporteISLRProducto } from '../domain/reporte-islr';
import { IReporteISLRRepository } from '../domain/repository/reporte-islr.repository';

interface Input { empresaId: string; periodo: string; }

export class GetReporteISLRUseCase extends UseCase<Input, ReporteISLRProducto[]> {
    constructor(private readonly repo: IReporteISLRRepository) { super(); }

    async execute({ empresaId, periodo }: Input): Promise<Result<ReporteISLRProducto[]>> {
        if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
            return Result.fail('Período inválido. Formato esperado: YYYY-MM');
        return this.repo.getReporte(empresaId, periodo);
    }
}
