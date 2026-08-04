import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IIslrRetentionsExportRepository } from '../../domain/repository/islr-retentions-export.repository';
import { IslrRetentionExportPayload, IslrRetentionExportRow } from '../../domain/islr-retentions-export';

type RawRow = Record<string, unknown>;
type Envelope = { agente_rif?: string; periodo_yyyymm?: string; rows?: RawRow[] };
const n = (value: unknown): number => value == null || value === '' ? 0 : Number(value);

export class SharedIslrRetentionsExportRepository implements IIslrRetentionsExportRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async getRetentionsForPeriod(companyId: string, period: string): Promise<Result<IslrRetentionExportPayload>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_islr_retention_period', {
                p_tenant_id: this.tenantId, p_company_id: companyId, p_period: period,
            });
            if (error) return Result.fail(error.message);
            const envelope = (data ?? {}) as Envelope;
            return Result.success({
                agentRif: envelope.agente_rif ?? '', periodYyyymm: envelope.periodo_yyyymm ?? '',
                rows: (envelope.rows ?? []).map((row): IslrRetentionExportRow => ({
                    operationDate: String(row.fecha_operacion ?? ''), supplierRif: String(row.proveedor_rif ?? ''),
                    supplierName: String(row.proveedor_nombre ?? ''), invoiceNumber: String(row.numero_factura ?? ''),
                    controlNumber: String(row.numero_control ?? ''), conceptCode: String(row.codigo_concepto ?? ''),
                    operationAmount: n(row.monto_operacion), percentage: n(row.porcentaje),
                    sustraendo: n(row.sustraendo), withheldAmount: n(row.monto_retenido),
                    voucherNumber: String(row.comprobante ?? ''),
                })),
            });
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared ISLR retentions');
        }
    }
}
