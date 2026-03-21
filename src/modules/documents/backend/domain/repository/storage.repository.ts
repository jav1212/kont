import { Result } from '@/src/core/domain/result';

export interface IDocumentStorageRepository {
    createSignedUploadUrl(storagePath: string): Promise<Result<{ signedUrl: string; path: string }>>;
    createSignedDownloadUrl(storagePath: string, ttlSeconds: number): Promise<Result<string>>;
    deleteFile(storagePath: string): Promise<Result<void>>;
}
