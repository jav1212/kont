// Move a document to a different folder (or to root when folderId is null).
// Application layer — keeps the "no-op detection" business rule out of the route handler.
import { UseCase } from '@/src/core/domain/use-case';
import { Result }  from '@/src/core/domain/result';
import { Document } from '../../domain/document';
import { IDocumentRepository } from '../../domain/repository/document.repository';

interface Input {
    id:        string;
    folderId:  string | null;
}

export class MoveDocumentUseCase extends UseCase<Input, Document> {
    constructor(private readonly repo: IDocumentRepository) { super(); }

    async execute({ id, folderId }: Input): Promise<Result<Document>> {
        if (!id) return Result.fail('ID de documento requerido');

        const current = await this.repo.findById(id);
        if (current.isFailure) return Result.fail(current.getError());

        const doc = current.getValue();
        const target = folderId ?? null;

        if ((doc.folderId ?? null) === target) {
            // No-op — return the current doc without hitting the RPC.
            return Result.success(doc);
        }

        return this.repo.updateFolder(id, target);
    }
}
