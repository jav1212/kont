// Repository interface: IIslrRetentionsExportRepository
// Domain port para fetch del envelope XML ISLR mensual sobre compras.
import { Result } from '@/src/core/domain/result';
import { IslrRetentionExportPayload } from '../islr-retentions-export';

export interface IIslrRetentionsExportRepository {
    getRetentionsForPeriod(
        companyId: string,
        period:    string,
    ): Promise<Result<IslrRetentionExportPayload>>;
}
