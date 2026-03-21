import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { DocumentFolder } from '../domain/document-folder';
import { IDocumentFolderRepository } from '../domain/repository/document-folder.repository';

interface Input {
    name:      string;
    parentId?: string | null;
    companyId?: string | null;
    createdBy: string;
}

export class CreateFolderUseCase extends UseCase<Input, DocumentFolder> {
    constructor(private readonly repo: IDocumentFolderRepository) { super(); }

    async execute({ name, parentId = null, companyId = null, createdBy }: Input): Promise<Result<DocumentFolder>> {
        if (!name?.trim()) return Result.fail('El nombre de la carpeta es requerido');
        return this.repo.create({ name: name.trim(), parentId, companyId, createdBy });
    }
}
