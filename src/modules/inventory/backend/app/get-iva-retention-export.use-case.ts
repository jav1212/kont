// get-iva-retention-export.use-case — devuelve el payload TXT de retenciones
// IVA del período (Providencia SNAT/2025/000054) listo para el frontend.
//
// Validación de período: 'YYYY-MM'. La validación de RIF/empresa la hace el
// RPC de Postgres (rechaza si la empresa no tiene RIF configurado, requisito
// SENIAT obligatorio).
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import {
    IIvaRetentionExportRepository,
    IvaRetentionExportPayload,
} from '../domain/repository/iva-retention-export.repository';

interface Input { companyId: string; period: string; }

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export class GetIvaRetentionExportUseCase extends UseCase<Input, IvaRetentionExportPayload> {
    constructor(private readonly repo: IIvaRetentionExportRepository) { super(); }

    async execute(input: Input): Promise<Result<IvaRetentionExportPayload>> {
        if (!input.companyId) return Result.fail('companyId is required');
        if (!PERIOD_REGEX.test(input.period)) {
            return Result.fail('Invalid period. Expected format: YYYY-MM');
        }
        return this.repo.getRetentionsForPeriod(input.companyId, input.period);
    }
}
