import { SupabaseClient } from '@supabase/supabase-js';
import { IDocumentRepository } from '../../domain/repository/document.repository';
import { Document } from '../../domain/document';
import { Result } from '@/src/core/domain/result';
import { ISource } from '@/src/shared/backend/source/domain/repository/source.repository';

// Raw DB row shape returned by tenant_documents_* RPCs — never exported beyond this file.
interface RawDocumentRow {
    id:           string;
    folder_id:    string | null;
    company_id:   string | null;
    name:         string;
    storage_path: string;
    mime_type:    string | null;
    size_bytes:   number | string | null;
    uploaded_by:  string;
    created_at:   string;
    updated_at:   string;
}

export class SupabaseDocumentRepository implements IDocumentRepository {
    constructor(
        private readonly source: ISource<SupabaseClient>,
        private readonly userId: string,
    ) {}

    async findByFolder(folderId: string | null, companyId?: string | null): Promise<Result<Document[]>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_documents_get', {
                    p_user_id:    this.userId,
                    p_folder_id:  folderId ?? null,
                    p_company_id: companyId ?? null,
                });
            if (error) return Result.fail(error.message);
            return Result.success(((data as RawDocumentRow[]) ?? []).map(this.mapToDomain));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching documents');
        }
    }

    async findById(id: string): Promise<Result<Document>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_documents_get_by_id', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) return Result.fail('Document not found');
            return Result.success(this.mapToDomain(row));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error fetching document');
        }
    }

    async create(input: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Document>> {
        try {
            const { data, error } = await this.source.instance
                .rpc('tenant_documents_insert', {
                    p_user_id:      this.userId,
                    p_name:         input.name,
                    p_storage_path: input.storagePath,
                    p_uploaded_by:  input.uploadedBy,
                    p_folder_id:    input.folderId ?? null,
                    p_company_id:   input.companyId ?? null,
                    p_mime_type:    input.mimeType ?? null,
                    p_size_bytes:   input.sizeBytes ?? null,
                });
            if (error) return Result.fail(error.message);
            const row = Array.isArray(data) ? data[0] : data;
            if (!row) return Result.fail('Could not register document');
            return Result.success(this.mapToDomain(row));
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error registering document');
        }
    }

    async delete(id: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance
                .rpc('tenant_documents_delete', {
                    p_user_id: this.userId,
                    p_id:      id,
                });
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error deleting document');
        }
    }

    private mapToDomain(row: RawDocumentRow): Document {
        return {
            id:          row.id,
            folderId:    row.folder_id ?? null,
            companyId:   row.company_id ?? null,
            name:        row.name,
            storagePath: row.storage_path,
            mimeType:    row.mime_type ?? null,
            sizeBytes:   row.size_bytes != null ? Number(row.size_bytes) : null,
            uploadedBy:  row.uploaded_by,
            createdAt:   row.created_at,
            updatedAt:   row.updated_at,
        };
    }
}
