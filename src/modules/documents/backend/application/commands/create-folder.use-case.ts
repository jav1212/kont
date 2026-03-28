// CreateFolderUseCase — validates and persists a document folder, then emits FolderCreated.
import { UseCase }                  from '@/src/core/domain/use-case';
import { Result }                   from '@/src/core/domain/result';
import { IEventBus }                from '@/src/core/domain/event-bus';
import { DocumentFolder }           from '../../domain/document-folder';
import { IDocumentFolderRepository } from '../../domain/repository/document-folder.repository';
import { FolderCreatedPayload }     from '../../domain/events/folder-created.event';

interface Input {
    name:       string;
    parentId?:  string | null;
    companyId?: string | null;
    createdBy:  string;
}

export class CreateFolderUseCase extends UseCase<Input, DocumentFolder> {
    constructor(
        private readonly repo:     IDocumentFolderRepository,
        private readonly eventBus?: IEventBus,
    ) { super(); }

    async execute({ name, parentId = null, companyId = null, createdBy }: Input): Promise<Result<DocumentFolder>> {
        if (!name?.trim()) return Result.fail('El nombre de la carpeta es requerido');

        const result = await this.repo.create({ name: name.trim(), parentId, companyId, createdBy });

        if (result.isSuccess && this.eventBus) {
            const folder = result.getValue();
            await this.eventBus.publish<FolderCreatedPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  'document.folder_created',
                occurredAt: new Date().toISOString(),
                payload: {
                    folderId:  folder.id,
                    name:      folder.name,
                    createdBy,
                    parentId:  parentId ?? null,
                    companyId: companyId ?? null,
                },
            });
        }

        return result;
    }
}
