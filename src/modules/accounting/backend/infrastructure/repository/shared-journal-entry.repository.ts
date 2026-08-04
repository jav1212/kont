import { SupabaseClient } from '@supabase/supabase-js';
import { IJournalEntryRepository, SaveEntryInput, EntryWithLines, TrialBalanceLine } from '../../domain/repository/journal-entry.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { JournalEntry } from '../../domain/journal-entry';
import { JournalEntryLine } from '../../domain/journal-entry-line';

interface RawEntry { id:string; company_id:string; period_id:string; entry_number:number; date:string; description:string; status:string; source:string; source_ref:string|null; posted_at:string|null; created_at:string; updated_at:string; }
interface RawLine { id:string; entry_id:string; account_id:string; account_code:string; account_name:string; type:string; amount:number; description:string|null; created_at:string; }
interface RawTrial { account_id:string; account_code:string; account_name:string; account_type:string; total_debit:number; total_credit:number; balance:number; }

export class SharedJournalEntryRepository implements IJournalEntryRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}

    async findByCompany(companyId:string, periodId?:string):Promise<Result<JournalEntry[]>> {
        const {data,error}=await this.source.instance.rpc('shared_accounting_entries_get',{p_tenant_id:this.tenantId,p_company_id:companyId,p_period_id:periodId??null});
        if(error)return Result.fail(error.message); return Result.success(((data as RawEntry[])??[]).map(this.mapEntry));
    }
    async findWithLines(entryId:string):Promise<Result<EntryWithLines>> {
        const {data,error}=await this.source.instance.rpc('shared_accounting_entry_with_lines_get',{p_tenant_id:this.tenantId,p_entry_id:entryId});
        if(error)return Result.fail(error.message); const raw=data as {entry:RawEntry;lines:RawLine[]};
        return Result.success({entry:this.mapEntry(raw.entry),lines:(raw.lines??[]).map(this.mapLine)});
    }
    async save(input:SaveEntryInput):Promise<Result<string>> {
        const {data,error}=await this.source.instance.rpc('shared_accounting_entry_save',{p_tenant_id:this.tenantId,p_entry:{id:input.entry.id??null,company_id:input.entry.companyId,period_id:input.entry.periodId,date:input.entry.date,description:input.entry.description,source:input.entry.source??'manual',source_ref:input.entry.sourceRef??null},p_lines:input.lines.map(l=>({account_id:l.accountId,type:l.type,amount:l.amount,description:l.description??null}))});
        return error?Result.fail(error.message):Result.success(data as string);
    }
    async post(entryId:string):Promise<Result<void>> { const {error}=await this.source.instance.rpc('shared_accounting_entry_post',{p_tenant_id:this.tenantId,p_entry_id:entryId}); return error?Result.fail(error.message):Result.success(undefined); }
    async deleteBySourceRef(companyId:string,source:string,sourceRef:string):Promise<Result<string[]>> {
        const {data,error}=await this.source.instance.rpc('shared_accounting_entries_delete_by_source',{p_tenant_id:this.tenantId,p_company_id:companyId,p_source:source,p_source_ref:sourceRef});
        if(error)return Result.fail(error.message); return Result.success(((data as Array<{entry_id:string}>)??[]).map(r=>r.entry_id));
    }
    async getTrialBalance(companyId:string,periodId?:string):Promise<Result<TrialBalanceLine[]>> {
        const {data,error}=await this.source.instance.rpc('shared_accounting_trial_balance_get',{p_tenant_id:this.tenantId,p_company_id:companyId,p_period_id:periodId??null});
        if(error)return Result.fail(error.message); return Result.success(((data as RawTrial[])??[]).map(this.mapTrial));
    }
    private mapEntry(row:RawEntry):JournalEntry{return {id:row.id,companyId:row.company_id,periodId:row.period_id,entryNumber:row.entry_number,date:row.date,description:row.description,status:row.status as JournalEntry['status'],source:row.source as JournalEntry['source'],sourceRef:row.source_ref,postedAt:row.posted_at,createdAt:row.created_at,updatedAt:row.updated_at};}
    private mapLine(row:RawLine):JournalEntryLine{return {id:row.id,entryId:row.entry_id,accountId:row.account_id,accountCode:row.account_code,accountName:row.account_name,type:row.type as JournalEntryLine['type'],amount:Number(row.amount),description:row.description,createdAt:row.created_at};}
    private mapTrial(row:RawTrial):TrialBalanceLine{return {accountId:row.account_id,accountCode:row.account_code,accountName:row.account_name,accountType:row.account_type,totalDebit:Number(row.total_debit),totalCredit:Number(row.total_credit),balance:Number(row.balance)};}
}