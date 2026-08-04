import { SupabaseClient } from '@supabase/supabase-js';
import { IBonoGuerraRunRepository, SaveBonoGuerraRunInput, UnconfirmedRun } from '../../domain/repository/bono-guerra-run.repository';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';
import { Result } from '@/src/core/domain/result';
import { BonoGuerraRun } from '../../domain/bono-guerra-run';
import { BonoGuerraReceipt } from '../../domain/bono-guerra-receipt';

interface RawRun { id:string; company_id:string; period_start:string; period_end:string; monto_usd:number; exchange_rate:number; status:string; confirmed_at:string; created_at:string; }
interface RawReceipt { id:string; run_id:string; company_id:string; employee_id:string; employee_cedula:string; employee_nombre:string; employee_cargo:string; monto_usd:number; monto_ves:number; created_at:string; }

export class SharedBonoGuerraRunRepository implements IBonoGuerraRunRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}
    async save(input: SaveBonoGuerraRunInput): Promise<Result<string>> {
        try {
            const { data,error }=await this.source.instance.rpc('shared_payroll_bono_guerra_run_save',{p_tenant_id:this.tenantId,p_run:{company_id:input.run.companyId,period_start:input.run.periodStart,period_end:input.run.periodEnd,monto_usd:input.run.montoUsd,exchange_rate:input.run.exchangeRate},p_receipts:input.receipts.map(r=>({employee_id:r.employeeId??null,employee_cedula:r.employeeCedula,employee_nombre:r.employeeNombre,employee_cargo:r.employeeCargo,monto_usd:r.montoUsd,monto_ves:r.montoVes})),p_status:input.run.status??'confirmed'});
            if(error)return Result.fail(error.message); return Result.success(data as string);
        } catch(err){return Result.fail(err instanceof Error?err.message:'Error al guardar bono de guerra');}
    }
    async findByCompany(companyId:string):Promise<Result<BonoGuerraRun[]>>{try{const{data,error}=await this.source.instance.rpc('shared_payroll_bono_guerra_runs_by_company',{p_tenant_id:this.tenantId,p_company_id:companyId});if(error)return Result.fail(error.message);return Result.success(((data as RawRun[])??[]).map(r=>this.mapRun(r)));}catch(err){return Result.fail(err instanceof Error?err.message:'Error al cargar historial de bono de guerra');}}
    async findReceiptsByRun(runId:string):Promise<Result<BonoGuerraReceipt[]>>{try{const{data,error}=await this.source.instance.rpc('shared_payroll_bono_guerra_receipts_by_run',{p_tenant_id:this.tenantId,p_run_id:runId});if(error)return Result.fail(error.message);return Result.success(((data as RawReceipt[])??[]).map(r=>this.mapReceipt(r)));}catch(err){return Result.fail(err instanceof Error?err.message:'Error al cargar recibos de bono de guerra');}}
    async unconfirm(runId:string):Promise<Result<UnconfirmedRun>>{try{const{data,error}=await this.source.instance.rpc('shared_payroll_bono_guerra_run_unconfirm',{p_tenant_id:this.tenantId,p_run_id:runId});if(error)return Result.fail(error.message);const r=data as{id:string;company_id:string};return Result.success({id:r.id,companyId:r.company_id});}catch(err){return Result.fail(err instanceof Error?err.message:'Error al revertir bono de guerra');}}
    private mapRun(r:RawRun):BonoGuerraRun{return{id:r.id,companyId:r.company_id,periodStart:r.period_start,periodEnd:r.period_end,montoUsd:Number(r.monto_usd),exchangeRate:Number(r.exchange_rate),status:r.status,confirmedAt:r.confirmed_at,createdAt:r.created_at};}
    private mapReceipt(r:RawReceipt):BonoGuerraReceipt{return{id:r.id,runId:r.run_id,companyId:r.company_id,employeeId:r.employee_id,employeeCedula:r.employee_cedula,employeeNombre:r.employee_nombre,employeeCargo:r.employee_cargo,montoUsd:Number(r.monto_usd),montoVes:Number(r.monto_ves),createdAt:r.created_at};}
}
