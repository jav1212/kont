// get-islr-retentions-export.use-case — devuelve el payload XML de retenciones
// ISLR de compras del período, listo para que el frontend ensamble el XML
// `<RelacionRetencionesISLR>` (Decreto 1808 + Anexo 6.1 SENIAT).
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import {
    IIslrRetentionsExportRepository,
} from '../domain/repository/islr-retentions-export.repository';
import { IslrRetentionExportPayload } from '../domain/islr-retentions-export';

interface Input { companyId: string; period: string; }

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export class GetIslrRetentionsExportUseCase extends UseCase<Input, IslrRetentionExportPayload> {
    constructor(private readonly repo: IIslrRetentionsExportRepository) { super(); }

    async execute(input: Input): Promise<Result<IslrRetentionExportPayload>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!PERIOD_REGEX.test(input.period)) {
            return Result.fail('Invalid period. Expected format: YYYY-MM');
        }
        return this.repo.getRetentionsForPeriod(input.companyId, input.period);
    }
}
