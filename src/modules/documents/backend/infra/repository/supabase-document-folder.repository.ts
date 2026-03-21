import { SupabaseClient } from '@supabase/supabase-js';
import { IDocumentFolderRepository } from '../../domain/repository/document-folder.repository';
import { DocumentFolder } from '../../domain/document-folder';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return Result.success(((data as any[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al obtener carpetas');
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
            if (!row) return Result.fail('No se pudo crear la carpeta');
            return Result.success(this.mapToDomain(row));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al crear carpeta');
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
            return Result.fail(err instanceof Error ? err.message : 'Error al eliminar carpeta');
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private mapToDomain(row: any): DocumentFolder {
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
