import { SupabaseClient } from '@supabase/supabase-js';
import { IDocumentFolderRepository } from '../../domain/repository/document-folder.repository';
import { DocumentFolder } from '../../domain/document-folder';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';

interface SharedDocumentFolderRow {
    id: string;
    parent_id: string | null;
    name: string;
    company_id: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
    version: number;
}

export class SharedDocumentFolderRepository implements IDocumentFolderRepository {
    constructor(private readonly source: ISource<SupabaseClient>, private readonly tenantId: string) {}
    async findByParent(parentId:string|null, companyId?:string|null):Promise<Result<DocumentFolder[]>> { let q=this.source.instance.from('shared_document_folders').select('*').eq('tenant_id',this.tenantId).order('name'); q=parentId===null?q.is('parent_id',null):q.eq('parent_id',parentId); if(companyId!==undefined) q=companyId===null?q.is('company_id',null):q.eq('company_id',companyId); const {data,error}=await q; return error?Result.fail(error.message):Result.success(((data as SharedDocumentFolderRow[] | null)??[]).map(this.map)); }
    async create(input:Omit<DocumentFolder,'id'|'createdAt'|'updatedAt'|'version'>):Promise<Result<DocumentFolder>> { const {data,error}=await this.source.instance.from('shared_document_folders').insert({tenant_id:this.tenantId,id:crypto.randomUUID(),parent_id:input.parentId, name:input.name,company_id:input.companyId,created_by:input.createdBy}).select('*').single(); return error?Result.fail(error.message):Result.success(this.map(data as SharedDocumentFolderRow)); }
    async update(id:string,name:string):Promise<Result<DocumentFolder>> { const {data,error}=await this.source.instance.from('shared_document_folders').update({name,updated_at:new Date().toISOString()}).eq('tenant_id',this.tenantId).eq('id',id).select('*').single(); return error?Result.fail(error.message):Result.success(this.map(data)); }
    async delete(id:string):Promise<Result<void>> { const {error}=await this.source.instance.from('shared_document_folders').delete().eq('tenant_id',this.tenantId).eq('id',id); return error?Result.fail(error.message):Result.success(undefined); }
    private map(row:SharedDocumentFolderRow):DocumentFolder{return {id:row.id,parentId:row.parent_id??null,name:row.name,companyId:row.company_id??null,createdBy:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at,version:row.version};}
}
