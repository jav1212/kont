import { UseCase } from '@/src/core/domain/use-case';
import { Result } from '@/src/core/domain/result';
import { IDocumentFolderRepository } from '../domain/repository/document-folder.repository';

interface Input {
    clientTenantIds: string[];
    createdBy: string;
    /** Si se indica, solo se replican las carpetas raíz con estos IDs (y sus hijos). Si no se indica, se replican todas. */
    sourceFolderIds?: string[];
}

interface ReplicationResult {
    tenantId: string;
    foldersCreated: number;
    foldersExisting: number;
    error?: string;
}

interface Output {
    results: ReplicationResult[];
}

export class ReplicateFoldersUseCase extends UseCase<Input, Output> {
    constructor(
        private readonly sourceRepo: IDocumentFolderRepository,
        private readonly repoFactory: (tenantId: string) => IDocumentFolderRepository,
    ) { super(); }

    async execute({ clientTenantIds, createdBy, sourceFolderIds }: Input): Promise<Result<Output>> {
        const allowedIds = sourceFolderIds ? new Set(sourceFolderIds) : null;

        const results: ReplicationResult[] = await Promise.all(
            clientTenantIds.map(async (tenantId) => {
                try {
                    const targetRepo = this.repoFactory(tenantId);
                    const { created, existing } = await this.replicateLevel(null, null, targetRepo, createdBy, allowedIds);
                    return { tenantId, foldersCreated: created, foldersExisting: existing };
                } catch (err) {
                    return {
                        tenantId,
                        foldersCreated:  0,
                        foldersExisting: 0,
                        error: err instanceof Error ? err.message : 'Error desconocido',
                    };
                }
            }),
        );

        return Result.success({ results });
    }

    private async replicateLevel(
        sourceParentId: string | null,
        targetParentId: string | null,
        targetRepo: IDocumentFolderRepository,
        createdBy: string,
        allowedRootIds: Set<string> | null = null,
    ): Promise<{ created: number; existing: number }> {
        const sourceResult = await this.sourceRepo.findByParent(sourceParentId);
        if (sourceResult.isFailure || !sourceResult.getValue().length) return { created: 0, existing: 0 };

        const all = sourceResult.getValue();
        const sourceFolders = (allowedRootIds && sourceParentId === null)
            ? all.filter((f) => allowedRootIds.has(f.id))
            : all;

        const targetResult = await targetRepo.findByParent(targetParentId);
        const targetFolders = targetResult.isFailure ? [] : targetResult.getValue();

        let created = 0;
        let existing = 0;

        for (const sourceFolder of sourceFolders) {
            const found = targetFolders.find((t) => t.name === sourceFolder.name);
            let targetFolderId: string;

            if (found) {
                targetFolderId = found.id;
                existing++;
            } else {
                const createResult = await targetRepo.create({
                    name:      sourceFolder.name,
                    parentId:  targetParentId,
                    companyId: null,
                    createdBy,
                });
                if (createResult.isFailure) continue;
                targetFolderId = createResult.getValue().id;
                created++;
            }

            const child = await this.replicateLevel(sourceFolder.id, targetFolderId, targetRepo, createdBy, null);
            created  += child.created;
            existing += child.existing;
        }

        return { created, existing };
    }
}
