import { SupabaseClient } from '@supabase/supabase-js';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import {
    IIgtfFortnightlyRepository,
    IgtfFortnightlyReport,
    IgtfFortnightlyConceptStat,
} from '../../domain/igtf-fortnightly-report';
import { IgtfConcept } from '../../domain/sales-invoice';

interface RpcEnvelope {
    agente_rif:   string;
    periodo:      string;
    quincena:     number;
    fecha_inicio: string;
    fecha_fin:    string;
    conceptos:    Record<string, {
        cantidad_operaciones: number | string;
        base_imponible_bs:    number | string;
        monto_igtf:           number | string;
    }>;
    total_igtf:   number | string;
}

const num = (v: number | string | null | undefined, fallback = 0): number =>
    v == null || v === '' ? fallback : Number(v);

export class RpcIgtfFortnightlyRepository implements IIgtfFortnightlyRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async getQuincenaReport(input: {
        companyId: string;
        year:      number;
        month:     number;
        quincena:  1 | 2;
    }): Promise<Result<IgtfFortnightlyReport>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_ventas_igtf_quincena', {
                    p_user_id:    this.userId,
                    p_empresa_id: input.companyId,
                    p_year:       input.year,
                    p_month:      input.month,
                    p_quincena:   input.quincena,
                });
            if (error) return Result.fail(error.message);
            const env = data as RpcEnvelope | null;
            if (!env) return Result.fail('Respuesta vacía del servidor');

            const byConcept: Partial<Record<IgtfConcept, IgtfFortnightlyConceptStat>> = {};
            for (const [concepto, stat] of Object.entries(env.conceptos ?? {})) {
                byConcept[concepto as IgtfConcept] = {
                    operationCount: num(stat.cantidad_operaciones),
                    baseAmountBs:   num(stat.base_imponible_bs),
                    igtfAmountBs:   num(stat.monto_igtf),
                };
            }

            return Result.success({
                agentRif:    env.agente_rif ?? '',
                period:      env.periodo ?? '',
                quincena:    (env.quincena === 2 ? 2 : 1),
                dateStart:   env.fecha_inicio ?? '',
                dateEnd:     env.fecha_fin ?? '',
                byConcept,
                totalIgtfBs: num(env.total_igtf),
            });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Failed to fetch IGTF quincena');
        }
    }
}
