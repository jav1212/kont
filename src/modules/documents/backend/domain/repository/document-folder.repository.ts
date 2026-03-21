import { Result } from '@/src/core/domain/result';
import { DocumentFolder } from '../document-folder';

export interface IDocumentFolderRepository {
    findByParent(parentId: string | null, companyId?: string | null): Promise<Result<DocumentFolder[]>>;
    create(data: Omit<DocumentFolder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Result<DocumentFolder>>;
    delete(id: string): Promise<Result<void>>;
}
