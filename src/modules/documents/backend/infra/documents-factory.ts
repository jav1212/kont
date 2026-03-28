// documents-factory — assembles the documents module dependency graph.
// Role: infrastructure entry point — constructs repositories and wires all use cases.
// Invariant: callers must not instantiate use cases directly; always go through this factory.
/**
 * @param ownerId — UUID del dueño del schema (puede diferir del usuario logueado
 *                  cuando un contable actúa en nombre de un cliente).
 *
 * Usa ServerSupabaseSource + RPC functions en public schema (mismo patrón
 * que inventory), ya que PostgREST no expone los schemas tenant directamente.
 */
import { ServerSupabaseSource }             from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }                    from '@/src/shared/backend/infra/local-event-bus';
import { SupabaseDocumentFolderRepository } from './repository/supabase-document-folder.repository';
import { SupabaseDocumentRepository }       from './repository/supabase-document.repository';
import { SupabaseDocumentStorageRepository } from './repository/supabase-document-storage.repository';
import { GetFoldersUseCase }                from '../app/get-folders.use-case';
import { CreateFolderUseCase }              from '../app/create-folder.use-case';
import { DeleteFolderUseCase }              from '../app/delete-folder.use-case';
import { GetDocumentsUseCase }              from '../app/get-documents.use-case';
import { RegisterDocumentUseCase }          from '../app/register-document.use-case';
import { DeleteDocumentUseCase }            from '../app/delete-document.use-case';
import { GetUploadUrlUseCase }              from '../app/get-upload-url.use-case';
import { GetDownloadUrlUseCase }            from '../app/get-download-url.use-case';
import { FindDocumentByIdUseCase }          from '../app/find-document-by-id.use-case';
import { ReplicateFoldersUseCase }          from '../app/replicate-folders.use-case';

export function getDocumentsActions(ownerId: string) {
    const source    = new ServerSupabaseSource();
    const eventBus  = new LocalEventBus();

    const folderRepo   = new SupabaseDocumentFolderRepository(source, ownerId);
    const documentRepo = new SupabaseDocumentRepository(source, ownerId);
    const storageRepo  = new SupabaseDocumentStorageRepository(source);

    return {
        getFolders:       new GetFoldersUseCase(folderRepo),
        createFolder:     new CreateFolderUseCase(folderRepo, eventBus),
        deleteFolder:     new DeleteFolderUseCase(folderRepo, eventBus),
        getDocuments:     new GetDocumentsUseCase(documentRepo),
        registerDocument: new RegisterDocumentUseCase(documentRepo, eventBus),
        deleteDocument:   new DeleteDocumentUseCase(documentRepo, storageRepo, eventBus),
        getUploadUrl:     new GetUploadUrlUseCase(storageRepo),
        getDownloadUrl:   new GetDownloadUrlUseCase(documentRepo, storageRepo),
        findDocumentById: new FindDocumentByIdUseCase(documentRepo),
        replicateFolders: new ReplicateFoldersUseCase(
            folderRepo,
            (tenantId) => new SupabaseDocumentFolderRepository(source, tenantId),
        ),
    };
}
