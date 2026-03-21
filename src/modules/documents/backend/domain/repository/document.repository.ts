import { Result } from '@/src/core/domain/result';
import { Document } from '../document';

export interface IDocumentRepository {
    findByFolder(folderId: string | null, companyId?: string | null): Promise<Result<Document[]>>;
    findById(id: string): Promise<Result<Document>>;
    create(data: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<Document>>;
    delete(id: string): Promise<Result<void>>;
}
