// src/modules/payroll/backend/infrastructure/payroll-settings-factory.ts
//
// DI factory: arma el grafo de dependencias de configuracion de nomina.
// Invariante: siempre usa ServerSupabaseSource en el lado servidor.

import { ServerSupabaseSource }            from '@/src/shared/backend/source/infra/server-supabase';
import { SharedPayrollSettingsRepository } from './repository/shared-payroll-settings.repository';
import { GetPayrollSettingsUseCase }       from '../application/queries/get-payroll-settings.use-case';
import { SavePayrollSettingsUseCase }      from '../application/commands/save-payroll-settings.use-case';

export function getPayrollSettingsActions(userId: string) {
    const source = new ServerSupabaseSource();
    const repo = new SharedPayrollSettingsRepository(source, userId);

    return {
        get:  new GetPayrollSettingsUseCase(repo),
        save: new SavePayrollSettingsUseCase(repo),
    };
}
