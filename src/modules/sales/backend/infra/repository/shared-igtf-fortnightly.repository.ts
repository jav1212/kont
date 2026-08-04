import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IgtfConcept } from '../../domain/sales-invoice';
import { IIgtfFortnightlyRepository, IgtfFortnightlyConceptStat, IgtfFortnightlyReport } from '../../domain/igtf-fortnightly-report';

type RawStat = { cantidad_operaciones?: number | string; base_imponible_bs?: number | string; monto_igtf?: number | string };
type RawEnvelope = { agente_rif?: string; periodo?: string; quincena?: number; fecha_inicio?: string; fecha_fin?: string; conceptos?: Record<string, RawStat>; total_igtf?: number | string };
const n = (value: number | string | null | undefined): number => value == null || value === '' ? 0 : Number(value);

export class SharedIgtfFortnightlyRepository implements IIgtfFortnightlyRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async getQuincenaReport(input: { companyId: string; year: number; month: number; quincena: 1 | 2 }): Promise<Result<IgtfFortnightlyReport>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_inventory_sales_igtf_fortnight', {
                p_tenant_id: this.tenantId, p_company_id: input.companyId, p_year: input.year, p_month: input.month, p_fortnight: input.quincena,
            });
            if (error) return Result.fail(error.message);
            const envelope = (data ?? {}) as RawEnvelope;
            const byConcept: Partial<Record<IgtfConcept, IgtfFortnightlyConceptStat>> = {};
            for (const [concept, stat] of Object.entries(envelope.conceptos ?? {})) {
                byConcept[concept as IgtfConcept] = { operationCount: n(stat.cantidad_operaciones), baseAmountBs: n(stat.base_imponible_bs), igtfAmountBs: n(stat.monto_igtf) };
            }
            return Result.success({ agentRif: envelope.agente_rif ?? '', period: envelope.periodo ?? '', quincena: envelope.quincena === 2 ? 2 : 1, dateStart: envelope.fecha_inicio ?? '', dateEnd: envelope.fecha_fin ?? '', byConcept, totalIgtfBs: n(envelope.total_igtf) });
        } catch (error) {
            return Result.fail(error instanceof Error ? error.message : 'Failed to fetch shared IGTF report');
        }
    }
}
