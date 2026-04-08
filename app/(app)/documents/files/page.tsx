"use client";
 
import { useState, useCallback } from 'react';
import { 
    Folders, 
    Menu, 
    X, 
    Loader2, 
    AlertCircle,
    ChevronRight,
    Copy,
    CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompany } from '@/src/modules/companies/frontend/hooks/use-companies';
import { useDocuments } from '@/src/modules/documents/frontend/hooks/use-documents';
import { FolderTree } from '@/src/modules/documents/frontend/components/folder-tree';
import { DocumentList } from '@/src/modules/documents/frontend/components/document-list';
import { UploadButton } from '@/src/modules/documents/frontend/components/upload-button';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';
import { PageHeader } from '@/src/shared/frontend/components/page-header';
import { BaseButton } from '@/src/shared/frontend/components/base-button';
 
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
        <div className="flex flex-col h-full bg-surface-1">
            <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4">
                <div className="flex items-center gap-2 mb-4 px-2">
                    <Folders size={14} className="text-primary-500" />
                    <span className="text-[10px] uppercase font-bold tracking-[0.15em] text-[var(--text-tertiary)]">
                        Carpetas
                    </span>
                </div>
                <FolderTree
                    folders={folders}
                    selectedFolderId={selectedFolderId}
                    onSelect={(id) => { selectFolder(id); setDrawerOpen(false); }}
                    onCreateFolder={createFolder}
                    onDeleteFolder={deleteFolder}
                />
            </div>
 
            <div className="p-4 border-t border-border-light bg-surface-2/30">
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onClick={openReplicModal}
                    isDisabled={replicating}
                    leftIcon={replicating ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                    className="w-full text-[11px] font-mono border-dashed"
                >
                    {replicating ? 'Replicando…' : 'Replicar plantilla'}
                </BaseButton.Root>
            </div>
        </div>
    );
 
    const totalCreated   = replicResult?.reduce((s, r) => s + r.foldersCreated,  0) ?? 0;
    const totalExisting  = replicResult?.reduce((s, r) => s + (r.foldersExisting ?? 0), 0) ?? 0;
    const failedCount    = replicResult?.filter((r) => r.error).length ?? 0;
    const allFailed      = replicResult !== null && replicResult.length > 0 && failedCount === replicResult.length;
 
    return (
        <div className="flex h-full overflow-hidden bg-surface-2">
 
            {/* ── Desktop sidebar (xl+) ─────────────────────────────────── */}
            <aside
                aria-label="Carpetas"
                className="hidden xl:flex xl:flex-col w-64 flex-shrink-0 border-r border-border-light shadow-sm z-10"
            >
                {FoldersPanel}
            </aside>
 
            {/* ── Mobile drawer ─────────────────────────────────────────── */}
            <AnimatePresence>
                {drawerOpen && (
                    <div className="xl:hidden fixed inset-0 z-[100] flex">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                            onClick={() => setDrawerOpen(false)}
                            aria-hidden="true"
                        />
                        <motion.aside
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="relative z-10 w-72 flex flex-col bg-surface-1 border-r border-border-light shadow-2xl"
                            aria-label="Carpetas móvil"
                        >
                            <div className="flex items-center justify-between px-6 py-5 border-b border-border-light">
                                <div className="flex items-center gap-2">
                                    <Folders size={16} className="text-primary-500" />
                                    <span className="text-[12px] font-bold uppercase tracking-widest text-foreground">Explorar</span>
                                </div>
                                <BaseButton.Icon
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setDrawerOpen(false)}
                                    aria-label="Cerrar"
                                >
                                    <X size={16} />
                                </BaseButton.Icon>
                            </div>
                            <div className="flex-1 overflow-hidden">
                                {FoldersPanel}
                            </div>
                        </motion.aside>
                    </div>
                )}
            </AnimatePresence>
 
            {/* ── Main content ──────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col overflow-hidden min-w-0">
                <PageHeader 
                    title="Archivos" 
                    subtitle={
                        <div className="flex items-center gap-1.5 min-w-0 font-bold text-primary-500">
                            <BaseButton.Root
                                variant="ghost"
                                size="sm"
                                onClick={() => selectFolder(null)}
                                className={`px-1.5 h-auto py-0.5 text-[12px] font-bold uppercase tracking-wider ${selectedFolderId ? 'text-primary-500/60 hover:text-primary-500' : 'text-primary-500'}`}
                            >
                                Documentos
                            </BaseButton.Root>
                            {selectedFolder && (
                                <>
                                    <ChevronRight size={12} className="text-foreground/20 shrink-0" />
                                    <span className="truncate">{folderLabel}</span>
                                </>
                            )}
                        </div>
                    }
                >
                    <div className="flex items-center gap-2">
                        <BaseButton.Icon
                            variant="secondary"
                            size="md"
                            className="xl:hidden"
                            onClick={() => setDrawerOpen(true)}
                        >
                            <Menu size={18} />
                        </BaseButton.Icon>
                        <UploadButton onUpload={handleUpload} />
                    </div>
                </PageHeader>
 
                {/* Error banner */}
                <AnimatePresence>
                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="mx-8 mt-4 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/20 flex items-start gap-3"
                        >
                            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={14} />
                            <p className="text-[12px] text-red-600 font-medium">{error}</p>
                        </motion.div>
                    )}
                </AnimatePresence>
 
                {/* Document list */}
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    <div className="max-w-5xl mx-auto h-full">
                        <DocumentList
                            documents={documents}
                            loading={loading}
                            onDelete={deleteDocument}
                            onDownload={getDownloadUrl}
                        />
                    </div>
                </div>
            </main>
 
            {/* ── Modals ────────────────────────────────────────────────── */}
            <AnimatePresence>
                {/* Replicate Confirm */}
                {replicConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                            onClick={() => setReplicConfirm(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md rounded-2xl bg-surface-1 shadow-2xl border border-border-light overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            <div className="p-6 border-b border-border-light flex items-center justify-between">
                                <div>
                                    <h3 className="text-[16px] font-bold text-foreground">Replicar plantilla</h3>
                                    <p className="text-[12px] text-[var(--text-tertiary)] mt-1">
                                        Crea la estructura de carpetas en tus clientes.
                                    </p>
                                </div>
                                <BaseButton.Icon variant="secondary" size="md" onClick={() => setReplicConfirm(false)}>
                                    <X size={18} />
                                </BaseButton.Icon>
                            </div>
 
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {clientsLoading ? (
                                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                                        <Loader2 className="animate-spin text-primary-500" size={24} />
                                        <p className="text-[12px] font-mono text-foreground/40 text-center">Analizando vinculaciones…</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Carpetas */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Carpetas base</span>
                                                <BaseButton.Root 
                                                    variant="ghost" 
                                                    size="sm"
                                                    onClick={() => setSelectedFolders(selectedFolders.size === sourceFolders.length ? new Set() : new Set(sourceFolders.map(f => f.id)))}
                                                    className="h-auto p-1 text-[10px] font-bold"
                                                >
                                                    {selectedFolders.size === sourceFolders.length ? 'Deseleccionar todas' : 'Todas'}
                                                </BaseButton.Root>
                                            </div>
                                            <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                                {sourceFolders.map(f => (
                                                    <label key={f.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-border-light bg-surface-2/50 hover:border-primary-500/30 cursor-pointer transition-all">
                                                        <input 
                                                            type="checkbox" 
                                                            className="accent-primary-500 w-4 h-4 rounded-md"
                                                            checked={selectedFolders.has(f.id)}
                                                            onChange={() => toggleFolder(f.id)}
                                                        />
                                                        <Folders size={14} className="text-foreground/30" />
                                                        <span className="text-[12px] font-medium truncate">{f.name}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="h-px bg-border-light" />

                                        {/* Empresas */}
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Empresas destino</span>
                                                <BaseButton.Root 
                                                    variant="ghost" 
                                                    size="sm"
                                                    onClick={() => setSelectedClients(selectedClients.size === clients.length ? new Set() : new Set(clients.map(c => c.tenantId)))}
                                                    className="h-auto p-1 text-[10px] font-bold"
                                                >
                                                    {selectedClients.size === clients.length ? 'Deseleccionar todas' : 'Todas'}
                                                </BaseButton.Root>
                                            </div>
                                            <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                                {clients.map(c => (
                                                    <label key={c.tenantId} className="flex items-center gap-3 p-2.5 rounded-xl border border-border-light bg-surface-2/50 hover:border-primary-500/30 cursor-pointer transition-all">
                                                        <input 
                                                            type="checkbox" 
                                                            className="accent-primary-500 w-4 h-4 rounded-md"
                                                            checked={selectedClients.has(c.tenantId)}
                                                            onChange={() => toggleClient(c.tenantId)}
                                                        />
                                                        <span className="text-[12px] font-medium truncate">{c.tenantEmail}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
 
                            <div className="p-6 bg-surface-2/50 border-t border-border-light flex gap-3">
                                <BaseButton.Root variant="secondary" onClick={() => setReplicConfirm(false)} className="flex-1">
                                    Cancelar
                                </BaseButton.Root>
                                <BaseButton.Root 
                                    variant="primary" 
                                    onClick={handleReplicate} 
                                    isDisabled={selectedClients.size === 0 || selectedFolders.size === 0}
                                    className="flex-1"
                                >
                                    Replicar estructura
                                </BaseButton.Root>
                            </div>
                        </motion.div>
                    </div>
                )}
 
                {/* Result Modal */}
                {replicResult && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                            onClick={() => setReplicResult(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-sm rounded-2xl bg-surface-1 shadow-2xl border border-border-light overflow-hidden p-6 text-center"
                        >
                            <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 ${allFailed ? 'bg-red-500/10 text-red-500' : 'bg-primary-500/10 text-primary-500'}`}>
                                {allFailed ? <AlertCircle size={32} /> : <CheckCircle2 size={32} />}
                            </div>
                            <h3 className="text-[18px] font-bold text-foreground">
                                {allFailed ? 'Replicación fallida' : '¡Proceso completado!'}
                            </h3>
                            <p className="text-[13px] text-[var(--text-secondary)] mt-2">
                                {totalCreated > 0 ? `${totalCreated} carpetas creadas con éxito.` : 'No se crearon carpetas nuevas.'}
                                {totalExisting > 0 && ` ${totalExisting} ya existían.`}
                            </p>
                            
                            <BaseButton.Root variant="primary" onClick={() => setReplicResult(null)} className="mt-6 w-full">
                                Aceptar e ir al tablero
                            </BaseButton.Root>
                        </motion.div>
                    </div>
                )}

                {/* Replicate Error Modal */}
                {replicError && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                            onClick={() => setReplicError(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-sm rounded-2xl bg-surface-1 shadow-2xl border border-border-light overflow-hidden p-6 text-center"
                        >
                            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 bg-red-500/10 text-red-500">
                                <AlertCircle size={32} />
                            </div>
                            <h3 className="text-[18px] font-bold text-foreground">Error de replicación</h3>
                            <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                                {replicError}
                            </p>
                            
                            <BaseButton.Root variant="secondary" onClick={() => setReplicError(null)} className="mt-6 w-full">
                                Cerrar y reintentar
                            </BaseButton.Root>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
