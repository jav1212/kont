import { SupabaseClient } from '@supabase/supabase-js';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { IPeriodCloseRepository } from '../../domain/repository/period-close.repository';
import { PeriodClose } from '../../domain/period-close';

type Raw = { id: string; company_id: string; period: string; closed_at: string | null; notes: string | null; dollar_rate: number | null };
const map = (row: Raw): PeriodClose => ({ id: row.id, companyId: row.company_id, period: row.period, closedAt: row.closed_at ?? undefined, notes: row.notes ?? '', dollarRate: row.dollar_rate });

export class SharedPeriodCloseRepository implements IPeriodCloseRepository {
  constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

  async list(companyId: string): Promise<Result<PeriodClose[]>> {
    const { data, error } = await this.source.instance.from('shared_inventory_closures').select('id,company_id,period,closed_at,notes,dollar_rate').eq('tenant_id', this.tenantId).eq('company_id', companyId).order('period', { ascending: false });
    return error ? Result.fail(error.message) : Result.success(((data as Raw[]) ?? []).map(map));
  }

  async save(input: PeriodClose): Promise<Result<PeriodClose>> {
    const { data, error } = await this.source.instance.from('shared_inventory_closures').upsert({ tenant_id: this.tenantId, id: input.id ?? crypto.randomUUID(), company_id: input.companyId, period: input.period, notes: input.notes ?? '', dollar_rate: input.dollarRate ?? null, closed_at: new Date().toISOString() }, { onConflict: 'tenant_id,company_id,period' }).select('id,company_id,period,closed_at,notes,dollar_rate').single();
    return error ? Result.fail(error.message) : Result.success(map(data as Raw));
  }
}
