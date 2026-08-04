// src/modules/payroll/backend/infrastructure/payroll-settings-factory.ts
//
// DI factory: arma el grafo de dependencias de configuracion de nomina.
// Invariante: siempre usa ServerSupabaseSource en el lado servidor.

import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { RpcPayrollSettingsRepository }    from './repository/rpc-payroll-settings.repository';
import { SharedPayrollSettingsRepository } from './repository/shared-payroll-settings.repository';
import { isSharedSchemaPilotEnabled }      from '@/src/shared/backend/config/shared-schema-pilot';
import { GetPayrollSettingsUseCase }       from '../application/queries/get-payroll-settings.use-case';
import { SavePayrollSettingsUseCase }      from '../application/commands/save-payroll-settings.use-case';

export function getPayrollSettingsActions(userId: string) {
    const source = new ServerSupabaseSource();
    const repo = isSharedSchemaPilotEnabled(process.env.SHARED_SCHEMA_PAYROLL_SETTINGS_ENABLED, userId)
        ? new SharedPayrollSettingsRepository(source, userId)
        : new RpcPayrollSettingsRepository(source, userId);

    return {
        get:  new GetPayrollSettingsUseCase(repo),
        save: new SavePayrollSettingsUseCase(repo),
    };
}
