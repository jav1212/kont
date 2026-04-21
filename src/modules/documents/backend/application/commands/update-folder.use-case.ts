// Rename an existing document folder.
// Application layer — keeps the business rule (non-empty name) out of the route handler.
import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { DocumentFolder } from '../../domain/document-folder';
import { IDocumentFolderRepository } from '../../domain/repository/document-folder.repository';

interface Input { id: string; name: string; }

export class UpdateFolderUseCase extends UseCase<Input, DocumentFolder> {
    constructor(private readonly repo: IDocumentFolderRepository) { super(); }

    async execute({ id, name }: Input): Promise<Result<DocumentFolder>> {
        if (!name.trim()) return Result.fail('El nombre no puede estar vacío');
        return this.repo.update(id, name.trim());
    }
}
