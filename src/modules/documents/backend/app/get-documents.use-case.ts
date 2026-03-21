import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Document } from '../domain/document';
import { IDocumentRepository } from '../domain/repository/document.repository';

interface Input { folderId?: string | null; companyId?: string | null; }

export class GetDocumentsUseCase extends UseCase<Input, Document[]> {
    constructor(private readonly repo: IDocumentRepository) { super(); }

    async execute({ folderId = null, companyId }: Input): Promise<Result<Document[]>> {
        return this.repo.findByFolder(folderId, companyId);
    }
}
