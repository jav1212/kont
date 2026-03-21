import { IDocumentStorageRepository } from '../../domain/repository/storage.repository';
import { Result } from '@/src/core/domain/result';
import { ServerSupabaseSource } from '@/src/shared/backend/source/infra/server-supabase';

const BUCKET = 'tenant-documents';

export class SupabaseDocumentStorageRepository implements IDocumentStorageRepository {
    constructor(private readonly source: ServerSupabaseSource) {}

    async createSignedUploadUrl(storagePath: string): Promise<Result<{ signedUrl: string; path: string }>> {
        try {
            const { data, error } = await this.source.instance.storage
                .from(BUCKET)
                .createSignedUploadUrl(storagePath);
            if (error) return Result.fail(error.message);
            return Result.success({ signedUrl: data.signedUrl, path: data.path });
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al generar URL de subida');
        }
    }

    async createSignedDownloadUrl(storagePath: string, ttlSeconds: number): Promise<Result<string>> {
        try {
            const { data, error } = await this.source.instance.storage
                .from(BUCKET)
                .createSignedUrl(storagePath, ttlSeconds);
            if (error) return Result.fail(error.message);
            return Result.success(data.signedUrl);
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al generar URL de descarga');
        }
    }

    async deleteFile(storagePath: string): Promise<Result<void>> {
        try {
            const { error } = await this.source.instance.storage
                .from(BUCKET)
                .remove([storagePath]);
            if (error) return Result.fail(error.message);
            return Result.success();
        } catch (err) {
            return Result.fail(err instanceof Error ? err.message : 'Error al eliminar archivo');
        }
    }
}
