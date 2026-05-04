// rpc-iva-retention-export.repository.ts — adaptador Supabase RPC para el
// fetch de retenciones IVA del período (TXT SENIAT). Lee el envelope
// { agente_rif, periodo_yyyymm, rows } del RPC y mapea a tipos de dominio.
import { SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import {
    IIvaRetentionExportRepository,
    IvaRetentionExportPayload,
} from '../../domain/repository/iva-retention-export.repository';
import { IvaRetentionExportRow } from '../../domain/iva-retention-export';

interface RpcRow {
    fecha:              string | null;
    tipo_operacion:     string | null;
    tipo_documento:     string | null;
    proveedor_rif:      string | null;
    proveedor_nombre:   string | null;
    numero_factura:     string | null;
    numero_control:     string | null;
    base_imponible:     number | string | null;
    alicuota:           number | string | null;
    iva_monto:          number | string | null;
    iva_retenido:       number | string | null;
    monto_total_linea:  number | string | null;
    monto_exento:       number | string | null;
    comprobante:        string | null;
    documento_afectado: string | null;
    expediente:         string | null;
}

interface RpcEnvelope {
    agente_rif:     string;
    periodo_yyyymm: string;
    rows:           RpcRow[];
}

const num = (v: number | string | null | undefined, fallback = 0): number =>
    v == null || v === '' ? fallback : Number(v);

export class RpcIvaRetentionExportRepository implements IIvaRetentionExportRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getRetentionsForPeriod(
        companyId: string,
        period: string,
    ): Promise<Result<IvaRetentionExportPayload>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_retenciones_iva_periodo', {
                    p_user_id:    this.userId,
                    p_empresa_id: companyId,
                    p_periodo:    period,
                });
            if (error) return Result.fail(error.message);
            const env = data as RpcEnvelope | null;
            if (!env) return Result.fail('Respuesta vacía del servidor');
            return Result.success({
                agentRif:     env.agente_rif ?? '',
                periodYyyymm: env.periodo_yyyymm ?? '',
                rows:         (env.rows ?? []).map((r) => this.mapRow(r, env.agente_rif ?? '', env.periodo_yyyymm ?? '')),
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch IVA retentions');
        }
    }

    private mapRow(row: RpcRow, agentRif: string, periodYyyymm: string): IvaRetentionExportRow {
        return {
            agentRif,
            periodYyyymm,
            date:             row.fecha              ?? '',
            operationType:    (row.tipo_operacion === 'V' ? 'V' : 'C'),
            documentType:     ((row.tipo_documento ?? '01') as '01' | '02' | '03'),
            supplierRif:      row.proveedor_rif      ?? '',
            supplierName:     row.proveedor_nombre   ?? '',
            invoiceNumber:    row.numero_factura     ?? '',
            controlNumber:    row.numero_control     ?? '',
            taxableBase:      num(row.base_imponible),
            vatRate:          num(row.alicuota),
            vatAmount:        num(row.iva_monto),
            vatWithheld:      num(row.iva_retenido),
            lineTotal:        num(row.monto_total_linea),
            exemptAmount:     num(row.monto_exento),
            voucherNumber:    row.comprobante         ?? '',
            affectedDocument: row.documento_afectado  ?? '0',
            fileNumber:       row.expediente          ?? '0',
        };
    }
}
