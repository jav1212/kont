import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IDocumentFolderRepository } from '../domain/repository/document-folder.repository';

interface Input { id: string; }

export class DeleteFolderUseCase extends UseCase<Input, void> {
    constructor(private readonly repo: IDocumentFolderRepository) { super(); }

    async execute({ id }: Input): Promise<Result<void>> {
        if (!id) return Result.fail('ID de carpeta requerido');
        return this.repo.delete(id);
    }
}
