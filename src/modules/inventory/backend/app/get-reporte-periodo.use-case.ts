import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { ReportePeriodoRow } from '../domain/reporte-periodo';
import { IReportePeriodoRepository } from '../domain/repository/reporte-periodo.repository';

interface Input { empresaId: string; periodo: string; }

export class GetReportePeriodoUseCase extends UseCase<Input, ReportePeriodoRow[]> {
    constructor(private readonly repo: IReportePeriodoRepository) { super(); }

    async execute({ empresaId, periodo }: Input): Promise<Result<ReportePeriodoRow[]>> {
        if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
            return Result.fail('Período inválido. Formato esperado: YYYY-MM');
        return this.repo.getReporte(empresaId, periodo);
    }
}
