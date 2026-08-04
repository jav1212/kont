import { SupabaseClient } from '@supabase/supabase-js';
import { IPayrollSettingsRepository } from '../../domain/repository/payroll-settings.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { PayrollSettings } from '../../domain/payroll-settings';

export class SharedPayrollSettingsRepository implements IPayrollSettingsRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async findByCompany(companyId: string): Promise<Result<PayrollSettings | null>> {
        try {
            const { data, error } = await this.source.instance.rpc('shared_payroll_settings_get', {
                p_tenant_id: this.tenantId,
                p_company_id: companyId,
            });
            if (error) return Result.fail(error.message);
            if (!data || Object.keys(data as object).length === 0) return Result.success(null);
            return Result.success(data as PayrollSettings);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al cargar la configuración de nómina');
        }
    }

    async save(companyId: string, settings: PayrollSettings): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance.rpc('shared_payroll_settings_save', {
                p_tenant_id: this.tenantId,
                p_company_id: companyId,
                p_settings: settings,
            });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al guardar la configuración de nómina');
        }
    }
}
