import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IPeriodCloseRepository } from '../../domain/repository/period-close.repository';
import { PeriodClose } from '../../domain/period-close';

type Raw = { id?: string; empresa_id?: string; company_id?: string; periodo?: string; period?: string; cerrado_at?: string; closed_at?: string; notas?: string; notes?: string; tasa_dolar?: number | null; dollar_rate?: number | null };
const map = (row: Raw): PeriodClose => ({ id: row.id, companyId: row.empresa_id ?? row.company_id ?? '', period: row.periodo ?? row.period ?? '', closedAt: row.cerrado_at ?? row.closed_at, notes: row.notas ?? row.notes ?? '', dollarRate: row.tasa_dolar ?? row.dollar_rate ?? null });

export class RpcPeriodCloseRepository implements IPeriodCloseRepository {
  constructor(private readonly source: ISource<SupabaseClient>, private readonly ownerId: string) {}

  async list(companyId: string): Promise<Result<PeriodClose[]>> {
    const { data, error } = await this.source.instance.rpc('tenant_inventario_cierres_get', { p_user_id: this.ownerId, p_empresa_id: companyId });
    return error ? Result.fail(error.message) : Result.success(((data as Raw[]) ?? []).map(map));
  }

  async save(input: PeriodClose): Promise<Result<PeriodClose>> {
    const { data, error } = await this.source.instance.rpc('tenant_inventario_cierre_save', { p_user_id: this.ownerId, p_empresa_id: input.companyId, p_periodo: input.period, p_notas: input.notes ?? '', p_tasa_dolar: input.dollarRate ?? null });
    return error ? Result.fail(error.message) : Result.success(map(data as Raw));
  }
}
