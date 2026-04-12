import { SupabaseClient } from '@supabase/supabase-js';
import { IDocumentFolderRepository } from '../../domain/repository/document-folder.repository';
import { DocumentFolder } from '../../domain/document-folder';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';

// Raw DB row shape returned by tenant_documents_folders_* RPCs — never exported beyond this file.
interface RawDocumentFolderRow {
    id:         string;
    parent_id:  string | null;
    name:       string;
    company_id: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
}

export class SupabaseDocumentFolderRepository implements IDocumentFolderRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByParent(parentId: string | null, companyId?: string | null): Promise<Result<DocumentFolder[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_documents_folders_get', {
                    p_user_id:    this.userId,
                    p_parent_id:  parentId ?? null,
                    p_company_id: companyId ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawDocumentFolderRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching folders');
        }
    }

    async create(input: Omit<DocumentFolder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<DocumentFolder>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_documents_folder_insert', {
                    p_user_id:    this.userId,
                    p_name:       input.name,
                    p_parent_id:  input.parentId ?? null,
                    p_company_id: input.companyId ?? null,
                    p_created_by: input.createdBy,
                });
            if (error) return Result.fail(error.message);
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) return Result.fail('Could not create folder');
            return Result.success(this.mapToDomain(row));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error creating folder');
        }
    }

    async update(id: string, name: string): Promise<Result<DocumentFolder>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_documents_folder_update', {
                    p_user_id: this.userId,
                    p_id:      id,
                    p_name:    name,
                });
            if (error) return Result.fail(error.message);
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) return Result.fail('Folder not found');
            return Result.success(this.mapToDomain(row));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error updating folder');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_documents_folder_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error deleting folder');
        }
    }

    private mapToDomain(row: RawDocumentFolderRow): DocumentFolder {
        return {
            id:        row.id,
            parentId:  row.parent_id ?? null,
            name:      row.name,
            companyId: row.company_id ?? null,
            createdBy: row.created_by,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }
}
