import { SupabaseClient } from '@supabase/supabase-js';
import { IDocumentRepository } from '../../domain/repository/document.repository';
import { Document } from '../../domain/document';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';

export class SharedDocumentRepository implements IDocumentRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}
    async findByFolder(folderId:string|null, companyId?:string|null):Promise<Result<Document[]>> { let q=this.source.instance.from('shared_documents').select('*').eq('tenant_id',this.tenantId).order('created_at',{ascending:false}); q=folderId===null?q.is('folder_id',null):q.eq('folder_id',folderId); if(companyId!==undefined) q=companyId===null?q.is('company_id',null):q.eq('company_id',companyId); const {data,error}=await q; return error?Result.fail(error.message):Result.success(((data as any[])??[]).map(this.map)); }
    async findById(id:string):Promise<Result<Document>> { const {data,error}=await this.source.instance.from('shared_documents').select('*').eq('tenant_id',this.tenantId).eq('id',id).single(); return error?Result.fail(error.message):Result.success(this.map(data)); }
    async create(input:Omit<Document,'id'|'createdAt'|'updatedAt'>):Promise<Result<Document>> { const {data,error}=await this.source.instance.from('shared_documents').insert({tenant_id:this.tenantId,id:crypto.randomUUID(),folder_id:input.folderId,company_id:input.companyId,name:input.name,storage_path:input.storagePath,mime_type:input.mimeType,size_bytes:input.sizeBytes,uploaded_by:input.uploadedBy}).select('*').single(); return error?Result.fail(error.message):Result.success(this.map(data)); }
    async updateFolder(id:string,folderId:string|null):Promise<Result<Document>> { const {data,error}=await this.source.instance.from('shared_documents').update({folder_id:folderId,updated_at:new Date().toISOString()}).eq('tenant_id',this.tenantId).eq('id',id).select('*').single(); return error?Result.fail(error.message):Result.success(this.map(data)); }
    async delete(id:string):Promise<Result<void>> { const {error}=await this.source.instance.from('shared_documents').delete().eq('tenant_id',this.tenantId).eq('id',id); return error?Result.fail(error.message):Result.success(undefined); }
    private map(row:any):Document{return {id:row.id,folderId:row.folder_id??null,companyId:row.company_id??null,name:row.name,storagePath:row.storage_path,mimeType:row.mime_type??null,sizeBytes:row.size_bytes==null?null:Number(row.size_bytes),uploadedBy:row.uploaded_by,createdAt:row.created_at,updatedAt:row.updated_at};}
}