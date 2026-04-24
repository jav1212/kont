// documents-factory — assembles the documents module dependency graph.
// Role: infrastructure entry point — constructs repositories and wires all use cases.
// Invariant: callers must not instantiate use cases directly; always go through this factory.
//
// ownerId — UUID of the schema owner (may differ from the logged-in user
//           when an accountant acts on behalf of a client).
//
// Uses ServerSupabaseSource + RPC functions in the public schema (same pattern
// as inventory), since PostgREST does not expose tenant schemas directly.
import { ServerSupabaseSource }             from '@/src/shared/backend/source/infra/server-supabase';
import { LocalEventBus }                    from '@/src/shared/backend/infra/local-event-bus';
import { SupabaseDocumentFolderRepository } from './repository/supabase-document-folder.repository';
import { SupabaseDocumentRepository }       from './repository/supabase-document.repository';
import { SupabaseDocumentStorageRepository } from './repository/supabase-document-storage.repository';
import { CreateFolderUseCase }              from '../application/commands/create-folder.use-case';
import { DeleteFolderUseCase }              from '../application/commands/delete-folder.use-case';
import { UpdateFolderUseCase }              from '../application/commands/update-folder.use-case';
import { RegisterDocumentUseCase }          from '../application/commands/register-document.use-case';
import { DeleteDocumentUseCase }            from '../application/commands/delete-document.use-case';
import { MoveDocumentUseCase }              from '../application/commands/move-document.use-case';
import { GetFoldersUseCase }                from '../application/queries/get-folders.use-case';
import { GetDocumentsUseCase }              from '../application/queries/get-documents.use-case';
import { GetUploadUrlUseCase }              from '../application/queries/get-upload-url.use-case';
import { GetDownloadUrlUseCase }            from '../application/queries/get-download-url.use-case';
import { FindDocumentByIdUseCase }          from '../application/queries/find-document-by-id.use-case';
import { ReplicateFoldersUseCase }          from '../application/queries/replicate-folders.use-case';

export function getDocumentsActions(ownerId: string) {
    const source   = new ServerSupabaseSource();
    const eventBus = new LocalEventBus();

    const folderRepo   = new SupabaseDocumentFolderRepository(source, ownerId);
    const documentRepo = new SupabaseDocumentRepository(source, ownerId);
    const storageRepo  = new SupabaseDocumentStorageRepository(source);

    return {
        getFolders:       new GetFoldersUseCase(folderRepo),
        createFolder:     new CreateFolderUseCase(folderRepo, eventBus),
        updateFolder:     new UpdateFolderUseCase(folderRepo),
        deleteFolder:     new DeleteFolderUseCase(folderRepo, eventBus),
        getDocuments:     new GetDocumentsUseCase(documentRepo),
        registerDocument: new RegisterDocumentUseCase(documentRepo, eventBus),
        deleteDocument:   new DeleteDocumentUseCase(documentRepo, storageRepo, eventBus),
        moveDocument:     new MoveDocumentUseCase(documentRepo),
        getUploadUrl:     new GetUploadUrlUseCase(storageRepo),
        getDownloadUrl:   new GetDownloadUrlUseCase(documentRepo, storageRepo),
        findDocumentById: new FindDocumentByIdUseCase(documentRepo),
        replicateFolders: new ReplicateFoldersUseCase(
            folderRepo,
            (tenantId) => new SupabaseDocumentFolderRepository(source, tenantId),
        ),
    };
}
