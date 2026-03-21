"use client";

import { useState } from 'react';
import { useCompany } from '@/src/modules/companies/frontend/hooks/use-companies';
import { useDocuments } from '@/src/modules/documents/frontend/hooks/use-documents';
import { FolderTree } from '@/src/modules/documents/frontend/components/folder-tree';
import { DocumentList } from '@/src/modules/documents/frontend/components/document-list';
import { UploadButton } from '@/src/modules/documents/frontend/components/upload-button';

export default function DocumentsPage() {
    const { companyId } = useCompany();
    const {
        folders,
        documents,
        selectedFolderId,
        loading,
        error,
        selectFolder,
        createFolder,
        deleteFolder,
        uploadDocument,
        deleteDocument,
        getDownloadUrl,
    } = useDocuments(companyId ?? undefined);

    const [drawerOpen, setDrawerOpen] = useState(false);

    async function handleUpload(file: File, onProgress: (pct: number) => void) {
        await uploadDocument(file, selectedFolderId, onProgress);
    }

    const selectedFolder = folders.find((f) => f.id === selectedFolderId);
    const folderLabel    = selectedFolder?.name ?? 'Todos los documentos';

    // ── Panels ────────────────────────────────────────────────────────────────

    const FoldersPanel = (
        <div className="flex flex-col h-full">
            <div className="px-4 pt-4 pb-3 border-b border-border-light">
                <p className="font-mono text-[10px] uppercase text-foreground/40 tracking-wider mb-3">
                    Carpetas
                </p>
                <FolderTree
                    folders={folders}
                    selectedFolderId={selectedFolderId}
                    onSelect={(id) => { selectFolder(id); setDrawerOpen(false); }}
                    onCreateFolder={createFolder}
                    onDeleteFolder={deleteFolder}
                />
            </div>
        </div>
    );

    return (
        <div className="flex h-full overflow-hidden">

            {/* ── Desktop sidebar (xl+) ─────────────────────────────────── */}
            <aside
                aria-label="Carpetas"
                className="hidden xl:block w-56 flex-shrink-0 border-r border-border-light bg-surface-1 overflow-y-auto"
            >
                {FoldersPanel}
            </aside>

            {/* ── Mobile drawer ─────────────────────────────────────────── */}
            {drawerOpen && (
                <div className="xl:hidden fixed inset-0 z-40 flex">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setDrawerOpen(false)}
                        aria-hidden="true"
                    />
                    <aside
                        className="relative z-50 w-64 bg-surface-1 border-r border-border-light overflow-y-auto"
                        aria-label="Carpetas"
                    >
                        <div className="flex items-center justify-between px-4 pt-4 pb-2">
                            <p className="font-mono text-[10px] uppercase text-foreground/40 tracking-wider">
                                Carpetas
                            </p>
                            <button
                                onClick={() => setDrawerOpen(false)}
                                aria-label="Cerrar"
                                className="p-1 rounded text-foreground/40 hover:text-foreground hover:bg-surface-2 transition-colors"
                            >
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                                    <path d="M2 2l9 9M11 2l-9 9" />
                                </svg>
                            </button>
                        </div>
                        <div className="px-4 pb-4">
                            <FolderTree
                                folders={folders}
                                selectedFolderId={selectedFolderId}
                                onSelect={(id) => { selectFolder(id); setDrawerOpen(false); }}
                                onCreateFolder={createFolder}
                                onDeleteFolder={deleteFolder}
                            />
                        </div>
                    </aside>
                </div>
            )}

            {/* ── Main content ──────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col overflow-hidden min-w-0">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border-light gap-3 flex-shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                        {/* Mobile: abrir drawer de carpetas */}
                        <button
                            onClick={() => setDrawerOpen(true)}
                            aria-label="Mostrar carpetas"
                            className="xl:hidden p-2 -ml-1 rounded-lg text-foreground/50 hover:text-foreground hover:bg-surface-2 transition-colors"
                        >
                            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                                <path d="M2 4h11M2 7.5h11M2 11h11" />
                            </svg>
                        </button>

                        {/* Breadcrumb */}
                        <div className="flex items-center gap-1.5 font-mono text-[12px] min-w-0">
                            <button
                                onClick={() => selectFolder(null)}
                                className={selectedFolderId ? 'text-foreground/50 hover:text-foreground transition-colors' : 'text-foreground font-medium'}
                            >
                                Documentos
                            </button>
                            {selectedFolder && (
                                <>
                                    <span className="text-foreground/30">/</span>
                                    <span className="text-foreground font-medium truncate">{folderLabel}</span>
                                </>
                            )}
                        </div>
                    </div>

                    <UploadButton onUpload={handleUpload} />
                </div>

                {/* Error banner */}
                {error && (
                    <div className="mx-5 mt-4 px-4 py-3 rounded-lg bg-red-500/[0.05] border border-red-500/20 font-mono text-[11px] text-red-500 flex-shrink-0">
                        {error}
                    </div>
                )}

                {/* Document list */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <DocumentList
                        documents={documents}
                        loading={loading}
                        onDelete={deleteDocument}
                        onDownload={getDownloadUrl}
                    />
                </div>
            </main>
        </div>
    );
}
