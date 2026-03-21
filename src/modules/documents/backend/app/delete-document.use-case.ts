import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IDocumentRepository } from '../domain/repository/document.repository';
import { IDocumentStorageRepository } from '../domain/repository/storage.repository';

interface Input { id: string; }

export class DeleteDocumentUseCase extends UseCase<Input, void> {
    constructor(
        private readonly documentRepo: IDocumentRepository,
        private readonly storageRepo:  IDocumentStorageRepository,
    ) { super(); }

    async execute({ id }: Input): Promise<Result<void>> {
        if (!id) return Result.fail('ID de documento requerido');

        const docResult = await this.documentRepo.findById(id);
        if (docResult.isFailure) return Result.fail(docResult.getError());

        const doc = docResult.getValue();

        // Eliminar de storage primero (fallo no bloquea eliminación de DB)
        await this.storageRepo.deleteFile(doc.storagePath);

        return this.documentRepo.delete(id);
    }
}
