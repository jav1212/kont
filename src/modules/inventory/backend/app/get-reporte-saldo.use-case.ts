import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { ReporteSaldoRow } from '../domain/reporte-saldo';
import { IReporteSaldoRepository } from '../domain/repository/reporte-saldo.repository';

interface Input { empresaId: string; periodo: string; }

export class GetReporteSaldoUseCase extends UseCase<Input, ReporteSaldoRow[]> {
    constructor(private readonly repo: IReporteSaldoRepository) { super(); }

    async execute({ empresaId, periodo }: Input): Promise<Result<ReporteSaldoRow[]>> {
        if (!periodo || !/^\d{4}-\d{2}$/.test(periodo))
            return Result.fail('Período inválido. Formato esperado: YYYY-MM');
        return this.repo.getReporte(empresaId, periodo);
    }
}
