import { SupabaseClient } from '@supabase/supabase-js';
import { IIntegrationRuleRepository, SaveIntegrationRuleInput } from '../../domain/repository/integration-rule.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { IntegrationRule, IntegrationSource, AmountField } from '../../domain/integration-rule';

export class SharedIntegrationRuleRepository implements IIntegrationRuleRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}
    async findByCompany(companyId:string, integrationSource?:IntegrationSource):Promise<Result<IntegrationRule[]>> {
        const {data,error}=await this.source.instance.rpc('shared_accounting_integration_rules_get',{p_tenant_id:this.tenantId,p_company_id:companyId,p_source:integrationSource??null});
        if(error)return Result.fail(error.message); return Result.success(((data as any[])??[]).map(this.map));
    }
    async save(input:SaveIntegrationRuleInput):Promise<Result<string>> {
        const {data,error}=await this.source.instance.rpc('shared_accounting_integration_rule_save',{p_tenant_id:this.tenantId,p_rule:{id:input.id??null,company_id:input.companyId,source:input.source,debit_account_id:input.debitAccountId,credit_account_id:input.creditAccountId,amount_field:input.amountField,description:input.description,is_active:input.isActive}});
        return error?Result.fail(error.message):Result.success(data as string);
    }
    async delete(ruleId:string):Promise<Result<void>> { const {error}=await this.source.instance.rpc('shared_accounting_integration_rule_delete',{p_tenant_id:this.tenantId,p_rule_id:ruleId}); return error?Result.fail(error.message):Result.success(undefined); }
    private map(row:any):IntegrationRule{return {id:row.id,companyId:row.company_id,source:row.source as IntegrationSource,debitAccountId:row.debit_account_id,creditAccountId:row.credit_account_id,amountField:row.amount_field as AmountField,description:row.description,isActive:row.is_active,createdAt:row.created_at,updatedAt:row.updated_at};}
}