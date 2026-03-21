import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { DocumentFolder } from '../domain/document-folder';
import { IDocumentFolderRepository } from '../domain/repository/document-folder.repository';

interface Input { parentId?: string | null; companyId?: string | null; }

export class GetFoldersUseCase extends UseCase<Input, DocumentFolder[]> {
    constructor(private readonly repo: IDocumentFolderRepository) { super(); }

    async execute({ parentId = null, companyId }: Input): Promise<Result<DocumentFolder[]>> {
        return this.repo.findByParent(parentId, companyId);
    }
}
