// Repository interface: IIvaRetentionExportRepository
// Domain port para fetch de las retenciones IVA del período. Devuelve el
// envelope { agentRif, periodYyyymm, rows } — el RIF y el período en formato
// SENIAT vienen siempre, incluso cuando no hay filas (caso "TXT en cero").
import { Result } from '@/src/core/domain/result';
import { IvaRetentionExportRow } from '../iva-retention-export';

export interface IvaRetentionExportPayload {
    agentRif:     string;
    periodYyyymm: string;
    rows:         IvaRetentionExportRow[];
}

export interface IIvaRetentionExportRepository {
    getRetentionsForPeriod(
        companyId: string,
        period: string,
    ): Promise<Result<IvaRetentionExportPayload>>;
}
