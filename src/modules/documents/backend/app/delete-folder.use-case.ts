// DeleteFolderUseCase — removes a document folder by ID, then emits FolderDeleted.
import { UseCase }                  from '@/src/core/domain/use-case';
import { Result }                   from '@/src/core/domain/result';
import { IEventBus }                from '@/src/core/domain/event-bus';
import { IDocumentFolderRepository } from '../domain/repository/document-folder.repository';
import { FolderDeletedPayload }     from '../domain/events/folder-deleted.event';

interface Input { id: string; }

export class DeleteFolderUseCase extends UseCase<Input, void> {
    constructor(
        private readonly repo:     IDocumentFolderRepository,
        private readonly eventBus?: IEventBus,
    ) { super(); }

    async execute({ id }: Input): Promise<Result<void>> {
        if (!id) return Result.fail('ID de carpeta requerido');

        const result = await this.repo.delete(id);

        if (result.isSuccess && this.eventBus) {
            await this.eventBus.publish<FolderDeletedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  'document.folder_deleted',
                occurredAt: new Date().toISOString(),
                payload: { folderId: id },
            });
        }

        return result;
    }
}
