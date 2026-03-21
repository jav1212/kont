import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Document } from '../domain/document';
import { IDocumentRepository } from '../domain/repository/document.repository';

interface Input {
    name:        string;
    storagePath: string;
    uploadedBy:  string;
    folderId?:   string | null;
    companyId?:  string | null;
    mimeType?:   string | null;
    sizeBytes?:  number | null;
}

export class RegisterDocumentUseCase extends UseCase<Input, Document> {
    constructor(private readonly repo: IDocumentRepository) { super(); }

    async execute({ name, storagePath, uploadedBy, folderId = null, companyId = null, mimeType = null, sizeBytes = null }: Input): Promise<Result<Document>> {
        if (!name?.trim())    return Result.fail('El nombre del documento es requerido');
        if (!storagePath)     return Result.fail('El storagePath es requerido');
        if (!uploadedBy)      return Result.fail('uploadedBy es requerido');
        return this.repo.create({ name: name.trim(), storagePath, uploadedBy, folderId, companyId, mimeType, sizeBytes });
    }
}
