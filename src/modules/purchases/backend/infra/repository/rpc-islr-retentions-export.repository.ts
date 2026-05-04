// rpc-islr-retentions-export.repository.ts — adaptador Supabase RPC para
// el fetch de retenciones ISLR sobre compras del período (XML SENIAT).
import { SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { IIslrRetentionsExportRepository } from '../../domain/repository/islr-retentions-export.repository';
import {
    IslrRetentionExportRow,
    IslrRetentionExportPayload,
} from '../../domain/islr-retentions-export';

interface RpcRow {
    fecha_operacion:  string | null;
    proveedor_rif:    string | null;
    proveedor_nombre: string | null;
    numero_factura:   string | null;
    numero_control:   string | null;
    codigo_concepto:  string | null;
    monto_operacion:  number | string | null;
    porcentaje:       number | string | null;
    sustraendo:       number | string | null;
    monto_retenido:   number | string | null;
    comprobante:      string | null;
}

interface RpcEnvelope {
    agente_rif:     string;
    periodo_yyyymm: string;
    rows:           RpcRow[];
}

const num = (v: number | string | null | undefined, fallback = 0): number =>
    v == null || v === '' ? fallback : Number(v);

export class RpcIslrRetentionsExportRepository implements IIslrRetentionsExportRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getRetentionsForPeriod(
        companyId: string,
        period:    string,
    ): Promise<Result<IslrRetentionExportPayload>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_inventario_islr_retenciones_periodo', {
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
                rows:         (env.rows ?? []).map(this.mapRow),
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch ISLR retentions');
        }
    }

    private mapRow(row: RpcRow): IslrRetentionExportRow {
        return {
            operationDate:    row.fecha_operacion  ?? '',
            supplierRif:      row.proveedor_rif    ?? '',
            supplierName:     row.proveedor_nombre ?? '',
            invoiceNumber:    row.numero_factura   ?? '',
            controlNumber:    row.numero_control   ?? '',
            conceptCode:      row.codigo_concepto  ?? '',
            operationAmount:  num(row.monto_operacion),
            percentage:       num(row.porcentaje),
            sustraendo:       num(row.sustraendo),
            withheldAmount:   num(row.monto_retenido),
            voucherNumber:    row.comprobante      ?? '',
        };
    }
}
