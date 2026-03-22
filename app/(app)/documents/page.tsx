"use client";

import { useState, useCallback } from 'react';
import { useCompany } from '@/src/modules/companies/frontend/hooks/use-companies';
import { useDocuments } from '@/src/modules/documents/frontend/hooks/use-documents';
import { FolderTree } from '@/src/modules/documents/frontend/components/folder-tree';
import { DocumentList } from '@/src/modules/documents/frontend/components/document-list';
import { UploadButton } from '@/src/modules/documents/frontend/components/upload-button';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';

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
        replicateFolders,
    } = useDocuments(companyId ?? undefined);

    type ClientTenant  = { tenantId: string; tenantEmail: string };
    type SourceFolder  = { id: string; name: string };

    const [drawerOpen,       setDrawerOpen]       = useState(false);
    const [replicating,      setReplicating]      = useState(false);
    const [replicResult,     setReplicResult]     = useState<{ tenantId: string; foldersCreated: number; foldersExisting: number; error?: string }[] | null>(null);
    const [replicError,      setReplicError]      = useState<string | null>(null);
    const [replicConfirm,    setReplicConfirm]    = useState(false);
    const [clients,          setClients]          = useState<ClientTenant[]>([]);
    const [clientsLoading,   setClientsLoading]   = useState(false);
    const [selectedClients,  setSelectedClients]  = useState<Set<string>>(new Set());
    const [sourceFolders,    setSourceFolders]    = useState<SourceFolder[]>([]);
    const [selectedFolders,  setSelectedFolders]  = useState<Set<string>>(new Set());

    async function handleUpload(file: File, onProgress: (pct: number) => void) {
        await uploadDocument(file, selectedFolderId, onProgress);
    }

    const openReplicModal = useCallback(async () => {
        setReplicResult(null);
        setReplicError(null);
        setReplicConfirm(true);
        setClientsLoading(true);
        try {
            const [membRes, foldersRes] = await Promise.all([
                apiFetch('/api/memberships'),
                apiFetch('/api/documents/folders'),
            ]);
            const membJson    = await membRes.json();
            const foldersJson = await foldersRes.json();

            const contableClients: ClientTenant[] = (membJson.data ?? [])
                .filter((m: { role: string; isOwn: boolean }) => m.role === 'contable' && !m.isOwn)
                .map((m: { tenantId: string; tenantEmail: string }) => ({ tenantId: m.tenantId, tenantEmail: m.tenantEmail }));

            const rootFolders: SourceFolder[] = (foldersJson.data ?? [])
                .map((f: { id: string; name: string }) => ({ id: f.id, name: f.name }));

            setClients(contableClients);
            setSelectedClients(new Set(contableClients.map((c) => c.tenantId)));
            setSourceFolders(rootFolders);
            setSelectedFolders(new Set(rootFolders.map((f) => f.id)));
        } finally {
            setClientsLoading(false);
        }
    }, []);

    function toggleClient(tenantId: string) {
        setSelectedClients((prev) => {
            const next = new Set(prev);
            if (next.has(tenantId)) next.delete(tenantId);
            else next.add(tenantId);
            return next;
        });
    }

    function toggleFolder(folderId: string) {
        setSelectedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    }

    async function handleReplicate() {
        setReplicConfirm(false);
        setReplicating(true);
        setReplicResult(null);
        setReplicError(null);
        try {
            const results = await replicateFolders([...selectedClients], [...selectedFolders]);
            setReplicResult(results);
        } catch (e) {
            setReplicError(e instanceof Error ? e.message : 'No se pudo replicar la plantilla. Intenta de nuevo.');
        } finally {
            setReplicating(false);
        }
    }

    const selectedFolder = folders.find((f) => f.id === selectedFolderId);
    const folderLabel    = selectedFolder?.name ?? 'Todos los documentos';

    // ── Panels ────────────────────────────────────────────────────────────────

    const FoldersPanel = (
        <div className="flex flex-col h-full">
            {/* Scrollable folder area */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-3 border-b border-border-light">
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

            {/* Sticky replication button */}
            <div className="flex-shrink-0 px-4 pt-3 pb-4">
                <button
                    onClick={openReplicModal}
                    disabled={replicating}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-border-medium text-foreground/40 hover:text-primary-500 hover:border-primary-500/40 hover:bg-primary-500/[0.04] font-mono text-[11px] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M7.5 2.5l2 2-2 2" />
                        <path d="M1.5 5.5h8" />
                        <path d="M3.5 1.5v8" />
                    </svg>
                    {replicating ? 'Replicando…' : 'Replicar plantilla'}
                </button>
            </div>
        </div>
    );

    const totalCreated   = replicResult?.reduce((s, r) => s + r.foldersCreated,  0) ?? 0;
    const totalExisting  = replicResult?.reduce((s, r) => s + (r.foldersExisting ?? 0), 0) ?? 0;
    const failedCount    = replicResult?.filter((r) => r.error).length ?? 0;
    const allFailed      = replicResult !== null && replicResult.length > 0 && failedCount === replicResult.length;

    return (
        <div className="flex h-full overflow-hidden">

            {/* ── Desktop sidebar (xl+) ─────────────────────────────────── */}
            <aside
                aria-label="Carpetas"
                className="hidden xl:flex xl:flex-col w-56 flex-shrink-0 border-r border-border-light bg-surface-1 overflow-hidden"
            >
                {FoldersPanel}
            </aside>

            {/* ── Mobile drawer ─────────────────────────────────────────── */}
            {drawerOpen && (
                <div
                    className="xl:hidden fixed inset-0 z-40 flex"
                    onKeyDown={(e) => e.key === 'Escape' && setDrawerOpen(false)}
                >
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setDrawerOpen(false)}
                        aria-hidden="true"
                    />
                    <aside
                        className="relative z-50 w-64 flex flex-col bg-surface-1 border-r border-border-light overflow-hidden"
                        aria-label="Carpetas"
                    >
                        <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
                            <p className="font-mono text-[10px] uppercase text-foreground/40 tracking-wider">
                                Carpetas
                            </p>
                            <button
                                onClick={() => setDrawerOpen(false)}
                                aria-label="Cerrar"
                                className="p-1 rounded text-foreground/40 hover:text-foreground hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                            >
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                                    <path d="M2 2l9 9M11 2l-9 9" />
                                </svg>
                            </button>
                        </div>
                        {FoldersPanel}
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

            {/* ── Modal: Confirmar replicación ────────────────────────── */}
            {replicConfirm && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    onKeyDown={(e) => e.key === 'Escape' && setReplicConfirm(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="replic-confirm-title"
                        className="w-full max-w-sm rounded-xl border border-border-light bg-surface-1 shadow-xl p-6 flex flex-col gap-4"
                    >
                        <div>
                            <p id="replic-confirm-title" className="font-mono text-[13px] font-medium text-foreground mb-1">
                                Replicar plantilla de carpetas
                            </p>
                            <p className="font-mono text-[11px] text-foreground/60 leading-relaxed">
                                Selecciona las empresas donde quieres replicar tus carpetas. Las carpetas existentes con el mismo nombre no se duplican.
                            </p>
                        </div>

                        {clientsLoading ? (
                            <p className="font-mono text-[11px] text-foreground/40 py-2 text-center">Cargando…</p>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {/* ── Carpetas ── */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-mono text-[10px] uppercase text-foreground/40 tracking-wider">Carpetas a replicar</span>
                                        <button
                                            onClick={() => setSelectedFolders(
                                                selectedFolders.size === sourceFolders.length
                                                    ? new Set()
                                                    : new Set(sourceFolders.map((f) => f.id))
                                            )}
                                            className="font-mono text-[10px] text-primary-500 hover:text-primary-600 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/40 rounded"
                                        >
                                            {selectedFolders.size === sourceFolders.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                                        </button>
                                    </div>
                                    {sourceFolders.length === 0 ? (
                                        <p className="font-mono text-[11px] text-foreground/40">No tienes carpetas creadas.</p>
                                    ) : (
                                        <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
                                            {sourceFolders.map((folder) => (
                                                <label
                                                    key={folder.id}
                                                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedFolders.has(folder.id)}
                                                        onChange={() => toggleFolder(folder.id)}
                                                        className="accent-primary-500 w-3.5 h-3.5 flex-shrink-0"
                                                    />
                                                    <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-foreground/40 flex-shrink-0">
                                                        <path d="M1 3.5A1 1 0 0 1 2 2.5h3l1 1.5h4a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3.5z" />
                                                    </svg>
                                                    <span className="font-mono text-[11px] text-foreground truncate">{folder.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ── Divisor ── */}
                                <div className="border-t border-border-light" />

                                {/* ── Empresas destino ── */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <span className="font-mono text-[10px] uppercase text-foreground/40 tracking-wider">
                                            Empresas destino
                                        </span>
                                        <button
                                            onClick={() => setSelectedClients(
                                                selectedClients.size === clients.length
                                                    ? new Set()
                                                    : new Set(clients.map((c) => c.tenantId))
                                            )}
                                            className="font-mono text-[10px] text-primary-500 hover:text-primary-600 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500/40 rounded"
                                        >
                                            {selectedClients.size === clients.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                                        </button>
                                    </div>
                                    {clients.length === 0 ? (
                                        <p className="font-mono text-[11px] text-foreground/40">No tienes empresas cliente como contador.</p>
                                    ) : (
                                        <div className="flex flex-col gap-0.5 max-h-36 overflow-y-auto">
                                            {clients.map((client) => (
                                                <label
                                                    key={client.tenantId}
                                                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedClients.has(client.tenantId)}
                                                        onChange={() => toggleClient(client.tenantId)}
                                                        className="accent-primary-500 w-3.5 h-3.5 flex-shrink-0"
                                                    />
                                                    <span className="font-mono text-[11px] text-foreground truncate">
                                                        {client.tenantEmail}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button
                                onClick={handleReplicate}
                                disabled={clientsLoading || selectedClients.size === 0 || selectedFolders.size === 0}
                                className="flex-1 py-2 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-mono text-[12px] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                            >
                                Replicar{selectedClients.size > 0 ? ` (${selectedClients.size})` : ''}
                            </button>
                            <button
                                onClick={() => setReplicConfirm(false)}
                                className="px-4 py-2 rounded-lg border border-border-light text-foreground/60 hover:text-foreground font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal: Error de replicación ─────────────────────────── */}
            {replicError && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    onKeyDown={(e) => e.key === 'Escape' && setReplicError(null)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="replic-error-title"
                        className="w-full max-w-sm rounded-xl border border-border-light bg-surface-1 shadow-xl p-6 flex flex-col gap-4"
                    >
                        <div>
                            <p id="replic-error-title" className="font-mono text-[13px] font-medium text-foreground mb-1">
                                Error en la replicación
                            </p>
                            <p className="font-mono text-[11px] text-red-500">{replicError}</p>
                        </div>
                        <button
                            onClick={() => setReplicError(null)}
                            className="w-full py-2 rounded-lg border border-border-light text-foreground/60 hover:text-foreground font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Modal: Resultado replicación ────────────────────────── */}
            {replicResult && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
                    onKeyDown={(e) => e.key === 'Escape' && setReplicResult(null)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="replic-result-title"
                        className="w-full max-w-sm rounded-xl border border-border-light bg-surface-1 shadow-xl p-6 flex flex-col gap-4"
                    >
                        <div>
                            <p id="replic-result-title" className="font-mono text-[13px] font-medium text-foreground mb-1">
                                {allFailed ? 'Error en la replicación' : 'Replicación completada'}
                            </p>
                            {replicResult.length === 0 ? (
                                <p className="font-mono text-[11px] text-foreground/60">
                                    No se seleccionaron empresas.
                                </p>
                            ) : (
                                <>
                                    <p className="font-mono text-[11px] text-foreground/60">
                                        {totalCreated > 0
                                            ? `${totalCreated} carpeta${totalCreated !== 1 ? 's' : ''} nueva${totalCreated !== 1 ? 's' : ''} creada${totalCreated !== 1 ? 's' : ''}.`
                                            : 'Ninguna carpeta nueva.'
                                        }
                                        {totalExisting > 0 && ` ${totalExisting} ya existía${totalExisting !== 1 ? 'n' : ''}.`}
                                    </p>
                                    {failedCount > 0 && (
                                        <p className="font-mono text-[11px] text-red-500 mt-0.5">
                                            {failedCount} empresa{failedCount !== 1 ? 's' : ''} tuvieron errores.
                                        </p>
                                    )}
                                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto mt-3">
                                        {replicResult.map((r) => {
                                            const email = clients.find((c) => c.tenantId === r.tenantId)?.tenantEmail ?? r.tenantId.slice(0, 8) + '…';
                                            return (
                                                <div key={r.tenantId} className="flex items-center gap-2 font-mono text-[10px]">
                                                    {r.error ? (
                                                        <span className="text-red-500 flex-shrink-0">✕</span>
                                                    ) : (
                                                        <span className="text-primary-500 flex-shrink-0">✓</span>
                                                    )}
                                                    <span className="text-foreground/70 truncate flex-1">{email}</span>
                                                    {r.error
                                                        ? <span className="text-red-500 truncate">{r.error}</span>
                                                        : <span className="text-foreground/40 flex-shrink-0">
                                                            {r.foldersCreated > 0
                                                                ? `${r.foldersCreated} nueva${r.foldersCreated !== 1 ? 's' : ''}`
                                                                : r.foldersExisting > 0
                                                                    ? 'ya existían'
                                                                    : 'sin cambios'
                                                            }
                                                          </span>
                                                    }
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                        <button
                            onClick={() => setReplicResult(null)}
                            className="w-full py-2 rounded-lg border border-border-light text-foreground/60 hover:text-foreground font-mono text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
