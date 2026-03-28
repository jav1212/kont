import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IDocumentStorageRepository } from '../../domain/repository/storage.repository';

interface Input {
    ownerId:   string;
    fileName:  string;
}

interface Output {
    documentId:  string;
    uploadUrl:   string;
    storagePath: string;
}

/** Genera una signed upload URL de Supabase Storage. No escribe en DB. */
export class GetUploadUrlUseCase extends UseCase<Input, Output> {
    constructor(private readonly storageRepo: IDocumentStorageRepository) { super(); }

    async execute({ ownerId, fileName }: Input): Promise<Result<Output>> {
        if (!ownerId)  return Result.fail('ownerId es requerido');
        if (!fileName) return Result.fail('fileName es requerido');

        const documentId  = crypto.randomUUID();
        const safeName    = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${ownerId}/${documentId}/${safeName}`;

        const urlResult = await this.storageRepo.createSignedUploadUrl(storagePath);
        if (urlResult.isFailure) return Result.fail(urlResult.getError());

        return Result.success({ documentId, uploadUrl: urlResult.getValue().signedUrl, storagePath });
    }
}
