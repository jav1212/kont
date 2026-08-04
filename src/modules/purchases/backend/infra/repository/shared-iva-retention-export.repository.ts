import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IIvaRetentionExportRepository, IvaRetentionExportPayload } from '../../domain/repository/iva-retention-export.repository';
import { IvaRetentionExportRow } from '../../domain/iva-retention-export';

type RawRow = Record<string, unknown>;
type Envelope = { agente_rif?: string; periodo_yyyymm?: string; rows?: RawRow[] };
const n = (value: unknown): number => value == null || value === '' ? 0 : Number(value);

export class SharedIvaRetentionExportRepository implements IIvaRetentionExportRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async getRetentionsForPeriod(companyId: string, period: string): Promise<Result<IvaRetentionExportPayload>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_iva_retention_period', {
                p_tenant_id: this.tenantId, p_company_id: companyId, p_period: period,
            });
            if (error) return Result.fail(error.message);
            const envelope = (data ?? {}) as Envelope;
            const agentRif = envelope.agente_rif ?? '';
            const periodYyyymm = envelope.periodo_yyyymm ?? '';
            return Result.success({
                agentRif, periodYyyymm,
                rows: (envelope.rows ?? []).map((row): IvaRetentionExportRow => ({
                    agentRif, periodYyyymm,
                    date: String(row.fecha ?? ''), operationType: 'C', documentType: '01',
                    supplierRif: String(row.proveedor_rif ?? ''), supplierName: String(row.proveedor_nombre ?? ''),
                    invoiceNumber: String(row.numero_factura ?? ''), controlNumber: String(row.numero_control ?? ''),
                    taxableBase: n(row.base_imponible), vatRate: n(row.alicuota), vatAmount: n(row.iva_monto),
                    vatWithheld: n(row.iva_retenido), lineTotal: n(row.monto_total_linea),
                    exemptAmount: n(row.monto_exento), voucherNumber: String(row.comprobante ?? ''),
                    affectedDocument: String(row.documento_afectado ?? '0'), fileNumber: String(row.expediente ?? '0'),
                })),
            });
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared IVA retentions');
        }
    }
}
