// DeleteDocumentUseCase — removes a document record and its storage file, then emits DocumentDeleted.
import { UseCase }                  from '@/src/core/domain/use-case';
import { Result }                   from '@/src/core/domain/result';
import { IEventBus }                from '@/src/core/domain/event-bus';
import { IDocumentRepository }      from '../domain/repository/document.repository';
import { IDocumentStorageRepository } from '../domain/repository/storage.repository';
import { DocumentDeletedPayload }   from '../domain/events/document-deleted.event';

interface Input { id: string; }

export class DeleteDocumentUseCase extends UseCase<Input, void> {
    constructor(
        private readonly documentRepo: IDocumentRepository,
        private readonly storageRepo:  IDocumentStorageRepository,
        private readonly eventBus?:    IEventBus,
    ) { super(); }

    async execute({ id }: Input): Promise<Result<void>> {
        if (!id) return Result.fail('ID de documento requerido');

        const docResult = await this.documentRepo.findById(id);
        if (docResult.isFailure) return Result.fail(docResult.getError());

        const doc = docResult.getValue();

        // Delete from storage first (failure does not block DB deletion).
        await this.storageRepo.deleteFile(doc.storagePath);

        const result = await this.documentRepo.delete(id);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<DocumentDeletedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  'document.deleted',
                occurredAt: new Date().toISOString(),
                payload: { documentId: id, storagePath: doc.storagePath },
            });
        }

        return result;
    }
}
