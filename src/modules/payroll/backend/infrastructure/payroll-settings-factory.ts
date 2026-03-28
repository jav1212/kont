// src/modules/payroll/backend/infrastructure/payroll-settings-factory.ts
//
// DI factory — assembles the payroll settings dependency graph.
// Invariant: always use ServerSupabaseSource for server-side execution.

import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { RpcPayrollSettingsRepository }    from './repository/rpc-payroll-settings.repository';
import { GetPayrollSettingsUseCase }       from '../application/queries/get-payroll-settings.use-case';
import { SavePayrollSettingsUseCase }      from '../application/commands/save-payroll-settings.use-case';

export function getPayrollSettingsActions(userId: string) {
    const source = new ServerSupabaseSource();
    const repo   = new RpcPayrollSettingsRepository(source, userId);

    return {
        get:  new GetPayrollSettingsUseCase(repo),
        save: new SavePayrollSettingsUseCase(repo),
    };
}
