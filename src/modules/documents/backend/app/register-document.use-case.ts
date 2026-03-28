// RegisterDocumentUseCase — persists a document record after upload, then emits DocumentRegistered.
import { UseCase }                   from '@/src/core/domain/use-case';
import { Result }                    from '@/src/core/domain/result';
import { IEventBus }                 from '@/src/core/domain/event-bus';
import { Document }                  from '../domain/document';
import { IDocumentRepository }       from '../domain/repository/document.repository';
import { DocumentRegisteredPayload } from '../domain/events/document-registered.event';

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
    constructor(
        private readonly repo:     IDocumentRepository,
        private readonly eventBus?: IEventBus,
    ) { super(); }

    async execute({ name, storagePath, uploadedBy, folderId = null, companyId = null, mimeType = null, sizeBytes = null }: Input): Promise<Result<Document>> {
        if (!name?.trim())  return Result.fail('El nombre del documento es requerido');
        if (!storagePath)   return Result.fail('El storagePath es requerido');
        if (!uploadedBy)    return Result.fail('uploadedBy es requerido');

        const result = await this.repo.create({ name: name.trim(), storagePath, uploadedBy, folderId, companyId, mimeType, sizeBytes });

        if (result.isSuccess && this.eventBus) {
            const doc = result.getValue();
            await this.eventBus.publish<DocumentRegisteredPayload>({
                eventId:    crypto.randomUUID(),
                eventType:  'document.registered',
                occurredAt: new Date().toISOString(),
                payload: {
                    documentId: doc.id,
                    name:       doc.name,
                    uploadedBy,
                    folderId:   folderId ?? null,
                    companyId:  companyId ?? null,
                    mimeType:   mimeType ?? null,
                    sizeBytes:  sizeBytes ?? null,
                },
            });
        }

        return result;
    }
}
