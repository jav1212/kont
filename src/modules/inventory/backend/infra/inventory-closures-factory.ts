import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';
import { isSharedSchemaEnabled } from '@/src/shared/backend/config/shared-schema-pilot';
import { IPeriodCloseRepository } from '../domain/repository/period-close.repository';
import { SharedPeriodCloseRepository } from './repository/shared-period-close.repository';
import { RpcPeriodCloseRepository } from './repository/rpc-period-close.repository';

export function getInventoryClosuresRepository(tenantId: string, ownerId: string): IPeriodCloseRepository {
  const source = new ServerSupabaseSource();
  return isSharedSchemaEnabled(tenantId)
    ? new SharedPeriodCloseRepository(source, tenantId)
    : new RpcPeriodCloseRepository(source, ownerId);
}
