import { SupabaseClient } from '@supabase/supabase-js';
import { IIntegrationLogRepository, SaveLogInput } from '../../domain/repository/integration-log.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { IntegrationLogEntry, IntegrationStatus } from '../../domain/integration-log';

export class SharedIntegrationLogRepository implements IIntegrationLogRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}
    async findByCompany(companyId:string, limit=100):Promise<Result<IntegrationLogEntry[]>> { const {data,error}=await this.source.instance.rpc('shared_accounting_integration_log_get',{p_tenant_id:this.tenantId,p_company_id:companyId,p_limit:limit}); if(error)return Result.fail(error.message); return Result.success(((data as any[])??[]).map(this.map)); }
    async save(input:SaveLogInput):Promise<Result<string>> { const {data,error}=await this.source.instance.rpc('shared_accounting_integration_log_save',{p_tenant_id:this.tenantId,p_log:{company_id:input.companyId,source:input.source,source_ref:input.sourceRef,entry_id:input.entryId,status:input.status,error_message:input.errorMessage}}); return error?Result.fail(error.message):Result.success(data as string); }
    private map(row:any):IntegrationLogEntry{return {id:row.id,companyId:row.company_id,source:row.source,sourceRef:row.source_ref,entryId:row.entry_id,status:row.status as IntegrationStatus,errorMessage:row.error_message,createdAt:row.created_at};}
}