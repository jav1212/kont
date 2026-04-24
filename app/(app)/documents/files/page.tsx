"use client";
 
import { useState, useCallback, useRef, useEffect } from 'react';
import {
    Folders,
    Menu,
    X,
    Loader2,
    AlertCircle,
    ChevronRight,
    Copy,
    CheckCircle2,
    UploadCloud,
    Check,
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
import { toast } from 'sonner';
 
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
        renameFolder,
        deleteFolder,
        uploadDocument,
        deleteDocument,
        moveDocument,
        getDownloadUrl,
        replicateFolders,
    } = useDocuments(companyId ?? undefined);
 
    type ClientTenant  = { tenantId: string; tenantEmail: string };
    type SourceFolder  = { id: string; name: string };
    type DropProgress  = { id: string; file: string; percent: number; done: boolean; error?: string };

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

    // Drag-and-drop state
    const [dragging,     setDragging]     = useState(false);
    const [dropProgress, setDropProgress] = useState<DropProgress[]>([]);
    const dragCounter = useRef(0);

    async function handleUpload(file: File, onProgress: (pct: number) => void) {
        await uploadDocument(file, selectedFolderId, onProgress);
    }

    const handleMoveDocuments = useCallback(async (docIds: string[], targetFolderId: string | null) => {
        if (docIds.length === 0) return;

        const targetName = targetFolderId
            ? folders.find((f) => f.id === targetFolderId)?.name ?? 'carpeta'
            : 'Todos los documentos';

        const results = await Promise.allSettled(
            docIds.map((id) => moveDocument(id, targetFolderId)),
        );
        const failedResults = results.filter(
            (r): r is PromiseRejectedResult => r.status === 'rejected',
        );
        const failed = failedResults.length;
        const ok     = results.length - failed;

        if (failed === 0) {
            toast.success(
                ok === 1
                    ? `Movido a ${targetName}`
                    : `${ok} documentos movidos a ${targetName}`,
            );
        } else {
            const firstReason = failedResults[0]?.reason;
            const errMessage  = firstReason instanceof Error
                ? firstReason.message
                : typeof firstReason === 'string'
                    ? firstReason
                    : 'Error desconocido';
            if (ok === 0) {
                toast.error('No se pudieron mover los documentos', { description: errMessage });
                console.error('[documents.move] all rejected', failedResults.map((r) => r.reason));
            } else {
                toast.warning(`${ok} movidos, ${failed} con error`, { description: errMessage });
                console.warn('[documents.move] partial failure', failedResults.map((r) => r.reason));
            }
        }
    }, [moveDocument, folders]);

    const handleDroppedFiles = useCallback(async (files: File[]) => {
        if (files.length === 0) return;
        const entries: DropProgress[] = files.map((f, i) => ({
            id: `${Date.now()}-${i}-${f.name}`,
            file: f.name,
            percent: 0,
            done: false,
        }));
        setDropProgress((prev) => [...prev, ...entries]);

        await Promise.all(
            entries.map(async (entry, i) => {
                const file = files[i];
                try {
                    await uploadDocument(file, selectedFolderId, (pct) => {
                        setDropProgress((prev) =>
                            prev.map((p) => (p.id === entry.id ? { ...p, percent: pct } : p)),
                        );
                    });
                    setDropProgress((prev) =>
                        prev.map((p) => (p.id === entry.id ? { ...p, percent: 100, done: true } : p)),
                    );
                } catch (err) {
                    setDropProgress((prev) =>
                        prev.map((p) => (p.id === entry.id
                            ? { ...p, error: err instanceof Error ? err.message : 'Error' }
                            : p)),
                    );
                }
            }),
        );
    }, [uploadDocument, selectedFolderId]);

    // Auto-clear completed entries after a grace period
    useEffect(() => {
        if (dropProgress.length === 0) return;
        const allSettled = dropProgress.every((p) => p.done || p.error);
        if (!allSettled) return;
        const timer = setTimeout(() => setDropProgress([]), 3500);
        return () => clearTimeout(timer);
    }, [dropProgress]);

    function onDragEnter(e: React.DragEvent<HTMLElement>) {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragCounter.current += 1;
        setDragging(true);
    }

    function onDragLeave(e: React.DragEvent<HTMLElement>) {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setDragging(false);
        }
    }

    function onDragOver(e: React.DragEvent<HTMLElement>) {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    }

    function onDrop(e: React.DragEvent<HTMLElement>) {
        e.preventDefault();
        dragCounter.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer.files);
        void handleDroppedFiles(files);
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
                    onRenameFolder={renameFolder}
                    onDeleteFolder={deleteFolder}
                    onMoveDocuments={handleMoveDocuments}
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
                            className="mx-8 mt-4 px-4 py-3 rounded-xl bg-error/5 border border-error/20 flex items-start gap-3"
                        >
                            <AlertCircle className="text-error shrink-0 mt-0.5" size={14} />
                            <p className="text-[12px] text-error font-sans font-medium">{error}</p>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Document list — dropzone container */}
                <div
                    className="relative flex-1 overflow-y-auto px-8 py-6"
                    onDragEnter={onDragEnter}
                    onDragLeave={onDragLeave}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                >
                    <div className="max-w-5xl mx-auto h-full">
                        <DocumentList
                            documents={documents}
                            loading={loading}
                            onDelete={deleteDocument}
                            onDownload={getDownloadUrl}
                        />
                    </div>

                    {/* Drag-over overlay */}
                    <AnimatePresence>
                        {dragging && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-8"
                            >
                                <div className="absolute inset-4 rounded-3xl border-2 border-dashed border-primary-500/60 bg-primary-500/5 backdrop-blur-[1px]" />
                                <div className="relative flex flex-col items-center gap-3 rounded-2xl bg-surface-1 border border-primary-500/30 shadow-xl px-8 py-6">
                                    <div className="w-14 h-14 rounded-2xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500">
                                        <UploadCloud size={28} strokeWidth={2} />
                                    </div>
                                    <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">
                                        Suelta para subir
                                    </p>
                                    <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                        Los archivos se guardarán en{' '}
                                        <span className="font-mono text-foreground">{folderLabel}</span>
                                    </p>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            {/* ── Floating drop-upload progress ─────────────────────────── */}
            <AnimatePresence>
                {dropProgress.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                        className="fixed bottom-6 right-6 z-[90] w-80 rounded-2xl border border-border-light bg-surface-1 shadow-xl overflow-hidden"
                        role="status"
                        aria-live="polite"
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border-light bg-surface-2/50">
                            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">
                                Subiendo {dropProgress.length}
                            </span>
                            <button
                                type="button"
                                onClick={() => setDropProgress([])}
                                aria-label="Cerrar panel de subida"
                                className="w-6 h-6 rounded-md flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-surface-2 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </div>
                        <ul className="max-h-64 overflow-y-auto py-2">
                            {dropProgress.map((p) => (
                                <li key={p.id} className="px-4 py-2 flex flex-col gap-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-[11px] text-foreground/80 truncate flex-1">
                                            {p.file}
                                        </span>
                                        <span className={`inline-flex items-center justify-center flex-shrink-0 font-mono text-[10px] tabular-nums ${
                                            p.error ? 'text-error' : p.done ? 'text-text-success' : 'text-foreground/40'
                                        }`}>
                                            {p.error
                                                ? <X size={12} strokeWidth={2.4} />
                                                : p.done
                                                    ? <Check size={12} strokeWidth={2.4} />
                                                    : `${p.percent}%`}
                                        </span>
                                    </div>
                                    <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${
                                                p.error ? 'bg-error' : p.done ? 'bg-primary-500' : 'bg-primary-500/60'
                                            }`}
                                            style={{ width: `${p.error ? 100 : p.percent}%` }}
                                        />
                                    </div>
                                    {p.error && (
                                        <p className="font-sans text-[11px] text-error mt-0.5">{p.error}</p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </motion.div>
                )}
            </AnimatePresence>
 
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
 
                {/* Result Modal — per-tenant breakdown */}
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
                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 10 }}
                            className="relative w-full max-w-lg rounded-2xl bg-surface-1 shadow-2xl border border-border-light overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* header */}
                            <div className="px-6 py-5 border-b border-border-light flex items-start gap-4">
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                    allFailed
                                        ? 'bg-error/10 text-error border border-error/20'
                                        : failedCount > 0
                                            ? 'bg-[var(--text-warning)]/10 text-[var(--text-warning)] border border-[var(--text-warning)]/20'
                                            : 'bg-text-success/10 text-text-success border border-text-success/20'
                                }`}>
                                    {allFailed
                                        ? <AlertCircle size={22} />
                                        : failedCount > 0
                                            ? <AlertCircle size={22} />
                                            : <CheckCircle2 size={22} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="text-[15px] font-bold text-foreground font-mono uppercase tracking-[0.08em]">
                                        {allFailed
                                            ? 'Replicación fallida'
                                            : failedCount > 0
                                                ? 'Replicación con errores'
                                                : 'Replicación completa'}
                                    </h3>
                                    <p className="text-[12px] font-sans text-[var(--text-tertiary)] mt-1 leading-relaxed">
                                        {allFailed
                                            ? 'No se pudo aplicar la plantilla en las empresas seleccionadas.'
                                            : `Procesadas ${replicResult.length} empresa${replicResult.length === 1 ? '' : 's'}${failedCount > 0 ? `, ${failedCount} con error` : ''}.`}
                                    </p>
                                </div>
                                <BaseButton.Icon variant="secondary" size="md" onClick={() => setReplicResult(null)} aria-label="Cerrar">
                                    <X size={16} />
                                </BaseButton.Icon>
                            </div>

                            {/* summary chips */}
                            <div className="grid grid-cols-3 gap-2 px-6 py-4 border-b border-border-light bg-surface-2/30">
                                <SummaryStat label="Creadas"   value={totalCreated}  tone="success" />
                                <SummaryStat label="Ya existían" value={totalExisting} tone="neutral" />
                                <SummaryStat label="Errores"   value={failedCount}   tone={failedCount > 0 ? 'error' : 'neutral'} />
                            </div>

                            {/* per-tenant list */}
                            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
                                {replicResult.map((r) => {
                                    const email = clients.find((c) => c.tenantId === r.tenantId)?.tenantEmail ?? r.tenantId;
                                    const hasErr = !!r.error;
                                    return (
                                        <div
                                            key={r.tenantId}
                                            className={[
                                                'flex items-start gap-3 px-3 py-2.5 rounded-xl border',
                                                hasErr
                                                    ? 'border-error/20 bg-error/[0.03]'
                                                    : 'border-border-light bg-surface-1 hover:bg-surface-2/40 transition-colors',
                                            ].join(' ')}
                                        >
                                            <div className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                                                hasErr
                                                    ? 'bg-error/10 text-error'
                                                    : r.foldersCreated > 0
                                                        ? 'bg-text-success/10 text-text-success'
                                                        : 'bg-surface-2 text-foreground/30'
                                            }`}>
                                                {hasErr
                                                    ? <AlertCircle size={12} strokeWidth={2.2} />
                                                    : <Check size={12} strokeWidth={2.4} />}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <p className="font-mono text-[12px] text-foreground truncate">
                                                    {email}
                                                </p>
                                                {hasErr ? (
                                                    <p className="mt-0.5 font-sans text-[11px] text-error leading-snug">
                                                        {r.error}
                                                    </p>
                                                ) : (
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                        {r.foldersCreated > 0 && (
                                                            <TenantChip tone="success" label={`${r.foldersCreated} creada${r.foldersCreated === 1 ? '' : 's'}`} />
                                                        )}
                                                        {r.foldersExisting > 0 && (
                                                            <TenantChip tone="neutral" label={`${r.foldersExisting} existente${r.foldersExisting === 1 ? '' : 's'}`} />
                                                        )}
                                                        {r.foldersCreated === 0 && r.foldersExisting === 0 && (
                                                            <TenantChip tone="neutral" label="Sin cambios" />
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* footer */}
                            <div className="px-6 py-4 bg-surface-2/50 border-t border-border-light flex justify-end">
                                <BaseButton.Root variant="primary" onClick={() => setReplicResult(null)}>
                                    Cerrar
                                </BaseButton.Root>
                            </div>
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
                            <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-4 bg-error/10 text-error">
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

// ── replicate result helpers ──────────────────────────────────────────────────

function SummaryStat({
    label, value, tone,
}: { label: string; value: number; tone: 'success' | 'error' | 'neutral' }) {
    const toneCls =
        tone === 'success' ? 'text-text-success'
      : tone === 'error'   ? 'text-error'
      :                      'text-foreground/60';

    return (
        <div className="flex flex-col items-center gap-0.5 py-1">
            <span className={`font-mono text-[22px] font-bold tabular-nums leading-none ${toneCls}`}>
                {value}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                {label}
            </span>
        </div>
    );
}

function TenantChip({
    label, tone,
}: { label: string; tone: 'success' | 'neutral' | 'error' }) {
    const toneCls =
        tone === 'success' ? 'bg-text-success/10 text-text-success border-text-success/20'
      : tone === 'error'   ? 'bg-error/10 text-error border-error/20'
      :                      'bg-surface-2 text-foreground/60 border-border-light';

    return (
        <span className={`inline-flex items-center gap-1 h-5 px-2 rounded-md border font-mono text-[10px] uppercase tracking-[0.1em] tabular-nums ${toneCls}`}>
            {label}
        </span>
    );
}
