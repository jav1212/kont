import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { Document } from '../domain/document';
import { IDocumentRepository } from '../domain/repository/document.repository';

interface Input { id: string; }

export class FindDocumentByIdUseCase extends UseCase<Input, Document> {
    constructor(private readonly repo: IDocumentRepository) { super(); }

    async execute({ id }: Input): Promise<Result<Document>> {
        if (!id) return Result.fail('ID requerido');
        return this.repo.findById(id);
    }
}
