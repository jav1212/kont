import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { IPeriodCloseRepository } from '../domain/repository/period-close.repository';
import { SharedPeriodCloseRepository } from './repository/shared-period-close.repository';

export function getInventoryClosuresRepository(tenantId: string, _ownerId: string): IPeriodCloseRepository {
  const source = new ServerSupabaseSource();
  return new SharedPeriodCloseRepository(source, tenantId);
}
