"use client";

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText,
    FileImage,
    FileSpreadsheet,
    File as FileIconLucide,
    Download,
    Trash2,
    Loader2,
    FileMinus,
    Search,
    X as XIcon,
    ArrowUpDown,
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    Eye,
    Square,
    CheckSquare,
    MinusSquare,
} from 'lucide-react';
import type { Document } from '../../backend/domain/document';
import { BaseButton } from '@/src/shared/frontend/components/base-button';

// ── types ─────────────────────────────────────────────────────────────────────

type FileKind = 'all' | 'pdf' | 'image' | 'sheet' | 'other';
type SortKey  = 'date' | 'name' | 'size';
type SortDir  = 'asc' | 'desc';

interface DocumentListProps {
    documents:  Document[];
    loading:    boolean;
    onDelete:   (id: string) => Promise<void>;
    onDownload: (id: string) => Promise<string>;
}

// Drag MIME type shared with FolderTree for document → folder moves.
export const DOC_DRAG_MIME = 'application/x-kont-docs';

// ── classification helpers ────────────────────────────────────────────────────

function classify(mime: string | null | undefined): Exclude<FileKind, 'all'> {
    if (!mime) return 'other';
    if (mime.includes('pdf'))                                 return 'pdf';
    if (mime.includes('image'))                               return 'image';
    if (mime.includes('sheet') || mime.includes('excel'))     return 'sheet';
    return 'other';
}

const KIND_META: Record<Exclude<FileKind, 'all'>, { label: string; Icon: typeof FileIconLucide; iconClass: string }> = {
    pdf:   { label: 'PDF',     Icon: FileText,        iconClass: 'text-error bg-error/5 border-error/15' },
    image: { label: 'Imagen',  Icon: FileImage,       iconClass: 'text-primary-500 bg-primary-500/5 border-primary-500/15' },
    sheet: { label: 'Hoja',    Icon: FileSpreadsheet, iconClass: 'text-text-success bg-text-success/5 border-text-success/15' },
    other: { label: 'Archivo', Icon: FileIconLucide,  iconClass: 'text-[var(--text-secondary)] bg-surface-2 border-border-light' },
};

// ── confirm dialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
    title:     string;
    message:   string;
    variant:   'danger' | 'default';
    onConfirm: () => void;
    onCancel:  () => void;
}

function ConfirmDialog({ title, message, variant, onConfirm, onCancel }: ConfirmDialogProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onCancel}
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                aria-hidden="true"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                className="relative w-full max-w-sm rounded-2xl border border-border-light bg-surface-1 shadow-2xl overflow-hidden"
            >
                <div className="p-6">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
                        variant === 'danger' ? 'bg-error/10 text-error' : 'bg-primary-500/10 text-primary-500'
                    }`}>
                        {variant === 'danger' ? <Trash2 size={24} /> : <Download size={24} />}
                    </div>

                    <h2 id="confirm-title" className="text-[15px] font-semibold text-foreground mb-1">
                        {title}
                    </h2>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed font-sans">
                        {message}
                    </p>
                </div>

                <div className="flex items-center gap-3 px-6 py-4 bg-surface-2/50 border-t border-border-light">
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={onCancel}
                        className="flex-1"
                    >
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        variant={variant === 'danger' ? 'danger' : 'primary'}
                        size="sm"
                        onClick={onConfirm}
                        className="flex-1"
                    >
                        {variant === 'danger' ? 'Eliminar' : 'Confirmar'}
                    </BaseButton.Root>
                </div>
            </motion.div>
        </div>
    );
}

// ── image preview modal ───────────────────────────────────────────────────────

interface ImagePreviewProps {
    doc:        Document;
    onDownload: (id: string) => Promise<string>;
    onClose:    () => void;
}

function ImagePreviewModal({ doc, onDownload, onClose }: ImagePreviewProps) {
    const [url,   setUrl]   = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const loading = url === null && error === null;

    useEffect(() => {
        let cancelled = false;
        onDownload(doc.id)
            .then((u) => { if (!cancelled) setUrl(u); })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo abrir la imagen');
            });
        return () => { cancelled = true; };
    }, [doc.id, onDownload]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                aria-hidden="true"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                role="dialog"
                aria-modal="true"
                aria-label={`Vista previa de ${doc.name}`}
                className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-border-light bg-surface-1 shadow-2xl overflow-hidden"
            >
                {/* header */}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border-light bg-surface-2/40">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center flex-shrink-0 text-primary-500">
                            <FileImage size={16} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <p className="font-mono text-[13px] text-foreground truncate">{doc.name}</p>
                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                                {doc.sizeBytes != null ? formatBytes(doc.sizeBytes) : '—'}
                                {' · '}
                                {formatDate(doc.createdAt)}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {url && (
                            <BaseButton.Root
                                as="a"
                                href={url}
                                variant="secondary"
                                size="sm"
                                leftIcon={<Download size={14} />}
                            >
                                Descargar
                            </BaseButton.Root>
                        )}
                        <BaseButton.Icon
                            variant="secondary"
                            size="md"
                            onClick={onClose}
                            aria-label="Cerrar vista previa"
                        >
                            <XIcon size={16} />
                        </BaseButton.Icon>
                    </div>
                </div>

                {/* body */}
                <div className="flex-1 flex items-center justify-center bg-surface-2/30 p-6 min-h-[300px] overflow-auto">
                    {loading && (
                        <div className="flex flex-col items-center gap-2 text-[var(--text-tertiary)]">
                            <Loader2 className="animate-spin text-primary-500" size={24} />
                            <p className="font-mono text-[11px] uppercase tracking-[0.12em]">Cargando…</p>
                        </div>
                    )}
                    {!loading && error && (
                        <div className="flex flex-col items-center gap-2 text-error">
                            <p className="font-mono text-[12px] uppercase tracking-[0.1em]">No se pudo cargar</p>
                            <p className="font-sans text-[12px] text-[var(--text-tertiary)] text-center max-w-sm">{error}</p>
                        </div>
                    )}
                    {!loading && !error && url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={url}
                            alt={doc.name}
                            className="max-w-full max-h-[70vh] object-contain rounded-lg border border-border-light shadow-sm"
                        />
                    )}
                </div>
            </motion.div>
        </div>
    );
}

// ── main component ────────────────────────────────────────────────────────────

export function DocumentList({ documents, loading, onDelete, onDownload }: DocumentListProps) {
    const [deletingId,    setDeletingId]    = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    const [confirmDelete,   setConfirmDelete]   = useState<Document | null>(null);
    const [confirmDownload, setConfirmDownload] = useState<Document | null>(null);
    const [previewDoc,      setPreviewDoc]      = useState<Document | null>(null);

    // bulk state
    const [selected,     setSelected]     = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkDownload, setBulkDownload] = useState(false);
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

    // drag state (doc IDs being dragged out to a folder)
    const [draggedIds, setDraggedIds] = useState<Set<string>>(new Set());

    // toolbar state
    const [search,   setSearch]   = useState('');
    const [kind,     setKind]     = useState<FileKind>('all');
    const [sortKey,  setSortKey]  = useState<SortKey>('date');
    const [sortDir,  setSortDir]  = useState<SortDir>('desc');

    const kindCounts = useMemo(() => {
        const c: Record<Exclude<FileKind, 'all'>, number> = { pdf: 0, image: 0, sheet: 0, other: 0 };
        for (const d of documents) c[classify(d.mimeType)] += 1;
        return c;
    }, [documents]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        const arr = documents
            .filter((d) => kind === 'all' ? true : classify(d.mimeType) === kind)
            .filter((d) => !q || d.name.toLowerCase().includes(q));

        arr.sort((a, b) => {
            const dir = sortDir === 'asc' ? 1 : -1;
            if (sortKey === 'name') return a.name.localeCompare(b.name, 'es-VE') * dir;
            if (sortKey === 'size') return ((a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)) * dir;
            return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        });
        return arr;
    }, [documents, search, kind, sortKey, sortDir]);

    // Drop selections that no longer exist in the documents list (e.g. after delete or filter change)
    useEffect(() => {
        setSelected((prev) => {
            if (prev.size === 0) return prev;
            const present = new Set(documents.map((d) => d.id));
            const next = new Set<string>();
            for (const id of prev) if (present.has(id)) next.add(id);
            return next.size === prev.size ? prev : next;
        });
    }, [documents]);

    const filteredIds   = useMemo(() => filtered.map((d) => d.id), [filtered]);
    const selectedCount = selected.size;
    const selectedInFiltered = filteredIds.filter((id) => selected.has(id)).length;

    const allFilteredSelected = filteredIds.length > 0 && selectedInFiltered === filteredIds.length;
    const someFilteredSelected = selectedInFiltered > 0 && !allFilteredSelected;

    function toggleRow(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleSelectAll() {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) {
                for (const id of filteredIds) next.delete(id);
            } else {
                for (const id of filteredIds) next.add(id);
            }
            return next;
        });
    }

    function clearSelection() {
        setSelected(new Set());
    }

    function toggleSort(key: SortKey) {
        if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
    }

    async function handleDeleteConfirmed() {
        if (!confirmDelete) return;
        const id = confirmDelete.id;
        setConfirmDelete(null);
        setDeletingId(id);
        try { await onDelete(id); } finally { setDeletingId(null); }
    }

    async function handleDownloadConfirmed() {
        if (!confirmDownload) return;
        const id = confirmDownload.id;
        setConfirmDownload(null);
        setDownloadingId(id);

        const win = window.open('', '_blank');

        try {
            const url = await onDownload(id);
            if (win) win.location.href = url;
            else     window.location.href = url;
        } catch (err) {
            win?.close();
            throw err;
        } finally {
            setDownloadingId(null);
        }
    }

    async function handleBulkDownload() {
        if (selected.size === 0 || bulkDownload) return;
        setBulkDownload(true);
        try {
            const ids = [...selected];
            // Fetch URLs sequentially to avoid hammering; trigger invisible anchor downloads
            for (const id of ids) {
                try {
                    const url = await onDownload(id);
                    const doc = documents.find((d) => d.id === id);
                    const a   = document.createElement('a');
                    a.href     = url;
                    a.download = doc?.name ?? '';
                    a.rel      = 'noopener';
                    a.target   = '_blank';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } catch {
                    // continue with remaining
                }
            }
        } finally {
            setBulkDownload(false);
        }
    }

    async function handleBulkDelete() {
        if (selected.size === 0 || bulkDeleting) return;
        setConfirmBulkDelete(false);
        setBulkDeleting(true);
        try {
            const ids = [...selected];
            for (const id of ids) {
                try { await onDelete(id); } catch { /* skip failed, continue */ }
            }
            setSelected(new Set());
        } finally {
            setBulkDeleting(false);
        }
    }

    // ── loading skeleton ──────────────────────────────────────────────
    if (loading) {
        return (
            <ul className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                    <li
                        key={i}
                        className="h-[68px] rounded-2xl bg-surface-1 border border-border-light/50 flex items-center px-4 gap-4 animate-pulse"
                    >
                        <div className="w-10 h-10 rounded-xl bg-surface-2" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-1/3 bg-surface-2 rounded-full" />
                            <div className="h-2 w-1/4 bg-surface-2 rounded-full" />
                        </div>
                    </li>
                ))}
            </ul>
        );
    }

    const hasAny     = documents.length > 0;
    const hasResults = filtered.length > 0;

    // ── empty: no documents at all ────────────────────────────────────
    if (!hasAny) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
            >
                <div className="w-16 h-16 rounded-3xl bg-surface-1 border border-border-light flex items-center justify-center mb-4 shadow-sm">
                    <FileMinus className="text-foreground/20" size={32} />
                </div>
                <p className="text-[14px] font-semibold text-foreground mb-1 font-mono uppercase tracking-[0.08em]">
                    No hay documentos
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)] max-w-[260px] font-sans">
                    Arrastra un archivo aquí o usa <span className="font-mono uppercase tracking-wide">Subir archivos</span> para empezar.
                </p>
            </motion.div>
        );
    }

    const SelectAllIcon = allFilteredSelected ? CheckSquare : someFilteredSelected ? MinusSquare : Square;

    return (
        <div className="flex flex-col gap-4">
            {/* ── toolbar ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-stretch gap-2">
                    {/* search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none"
                        />
                        <input
                            type="text"
                            placeholder="Buscar por nombre…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full h-9 pl-9 pr-8 rounded-lg border border-border-default bg-surface-1 font-mono text-[13px] text-foreground placeholder:text-foreground/40 placeholder:font-mono focus:outline-none focus:border-primary-500 transition-colors"
                            aria-label="Buscar documentos"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Limpiar búsqueda"
                                className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-surface-2 transition-colors"
                            >
                                <XIcon size={12} />
                            </button>
                        )}
                    </div>

                    {/* sort */}
                    <div className="flex items-center gap-1 px-1 rounded-lg border border-border-light bg-surface-1">
                        <span className="px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] hidden md:inline">
                            Orden
                        </span>
                        <SortButton label="Fecha"  active={sortKey === 'date'}  dir={sortDir} onClick={() => toggleSort('date')}  />
                        <SortButton label="Nombre" active={sortKey === 'name'}  dir={sortDir} onClick={() => toggleSort('name')}  />
                        <SortButton label="Peso"   active={sortKey === 'size'}  dir={sortDir} onClick={() => toggleSort('size')}  />
                    </div>
                </div>

                {/* kind filter chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <KindChip label="Todos"  count={documents.length} active={kind === 'all'}   onClick={() => setKind('all')} />
                    <KindChip label="PDF"    count={kindCounts.pdf}   active={kind === 'pdf'}   onClick={() => setKind('pdf')}   tint="error" />
                    <KindChip label="Imagen" count={kindCounts.image} active={kind === 'image'} onClick={() => setKind('image')} tint="primary" />
                    <KindChip label="Hoja"   count={kindCounts.sheet} active={kind === 'sheet'} onClick={() => setKind('sheet')} tint="success" />
                    <KindChip label="Otros"  count={kindCounts.other} active={kind === 'other'} onClick={() => setKind('other')} />
                    <span className="ml-auto font-mono text-[11px] text-[var(--text-tertiary)] tabular-nums">
                        {filtered.length} / {documents.length}
                    </span>
                </div>

                {/* bulk select header */}
                {hasResults && (
                    <div className="flex items-center gap-2 px-1">
                        <button
                            type="button"
                            onClick={toggleSelectAll}
                            aria-label={allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                            className={[
                                'inline-flex items-center gap-1.5 h-7 px-2 rounded-md font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                                selectedInFiltered > 0
                                    ? 'text-primary-600'
                                    : 'text-[var(--text-secondary)] hover:text-foreground hover:bg-surface-2',
                            ].join(' ')}
                        >
                            <SelectAllIcon size={14} strokeWidth={2} className={selectedInFiltered > 0 ? 'text-primary-500' : ''} />
                            {allFilteredSelected ? 'Deseleccionar' : 'Seleccionar todos'}
                        </button>
                    </div>
                )}
            </div>

            {/* ── list ────────────────────────────────────────────── */}
            {!hasResults ? (
                <div className="flex flex-col items-center justify-center py-12 text-center rounded-2xl border border-dashed border-border-light bg-surface-1/50">
                    <Search className="text-foreground/20 mb-3" size={28} />
                    <p className="font-mono text-[13px] text-foreground/80 uppercase tracking-[0.08em]">
                        Sin coincidencias
                    </p>
                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-1">
                        Ajusta la búsqueda o el filtro de tipo.
                    </p>
                </div>
            ) : (
                <ul className="space-y-2" role="list" aria-label="Documentos">
                    <AnimatePresence mode="popLayout">
                        {filtered.map((doc) => {
                            const isDeleting    = deletingId    === doc.id;
                            const isDownloading = downloadingId === doc.id;
                            const isSelected    = selected.has(doc.id);
                            const k             = classify(doc.mimeType);
                            const meta          = KIND_META[k];
                            const canPreview    = k === 'image';

                            const isDragging = draggedIds.has(doc.id);

                            return (
                                <motion.li
                                    layout
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    key={doc.id}
                                    draggable
                                    // Cast: framer-motion's onDragStart/onDragEnd are typed for its gesture
                                    // system, but because we set the native `draggable` attr, HTML5 drag
                                    // events (with dataTransfer) are what actually fire at runtime.
                                    onDragStart={((e: React.DragEvent<HTMLLIElement>) => {
                                        const target = e.target as HTMLElement;
                                        if (target.closest('button, input, a, [role="button"]')) {
                                            e.preventDefault();
                                            return;
                                        }
                                        const ids = selected.has(doc.id) && selected.size > 1
                                            ? [...selected]
                                            : [doc.id];
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData(DOC_DRAG_MIME, JSON.stringify({ ids }));
                                        e.dataTransfer.setData('text/plain', ids.join(','));
                                        setDraggedIds(new Set(ids));
                                    }) as unknown as React.ComponentProps<typeof motion.li>['onDragStart']}
                                    onDragEnd={(() => setDraggedIds(new Set())) as unknown as React.ComponentProps<typeof motion.li>['onDragEnd']}
                                    className={[
                                        'group flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all duration-150 cursor-grab active:cursor-grabbing',
                                        isSelected
                                            ? 'bg-primary-500/[0.04] border-primary-500/30 shadow-sm shadow-primary-500/5'
                                            : 'bg-surface-1 border-border-light hover:border-primary-500/30 hover:shadow-md hover:shadow-primary-500/5',
                                    ].join(' ')}
                                >
                                    {/* checkbox */}
                                    <button
                                        type="button"
                                        onClick={() => toggleRow(doc.id)}
                                        aria-label={isSelected ? `Deseleccionar ${doc.name}` : `Seleccionar ${doc.name}`}
                                        aria-pressed={isSelected}
                                        className={[
                                            'w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 transition-colors',
                                            isSelected
                                                ? 'bg-primary-500 border-primary-500 text-white'
                                                : 'bg-surface-1 border-border-default text-foreground/30 hover:border-primary-500 hover:text-primary-500',
                                        ].join(' ')}
                                    >
                                        {isSelected
                                            ? <CheckSquare size={14} strokeWidth={2.2} />
                                            : <Square size={14} strokeWidth={2} />}
                                    </button>

                                    {/* icon */}
                                    <div className="relative">
                                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${meta.iconClass}`}>
                                            <meta.Icon size={20} />
                                        </div>
                                        {isDownloading && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-surface-1/80 rounded-xl">
                                                <Loader2 size={16} className="animate-spin text-primary-500" />
                                            </div>
                                        )}
                                    </div>

                                    {/* name + meta */}
                                    <button
                                        type="button"
                                        onClick={canPreview ? () => setPreviewDoc(doc) : () => toggleRow(doc.id)}
                                        className="flex-1 min-w-0 text-left group/name"
                                        aria-label={canPreview ? `Ver ${doc.name}` : undefined}
                                    >
                                        <p className={`text-[13px] font-medium truncate transition-colors ${
                                            canPreview
                                                ? 'text-foreground group-hover/name:text-primary-600 underline-offset-2 group-hover/name:underline decoration-primary-500/30'
                                                : 'text-foreground'
                                        }`}>
                                            {doc.name}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-tertiary)] font-mono tabular-nums">
                                            <span className="uppercase tracking-[0.1em] text-foreground/40">{meta.label}</span>
                                            <span className="w-1 h-1 rounded-full bg-border-medium" aria-hidden="true" />
                                            <span>{doc.sizeBytes != null ? formatBytes(doc.sizeBytes) : '—'}</span>
                                            <span className="w-1 h-1 rounded-full bg-border-medium" aria-hidden="true" />
                                            <span>{formatDate(doc.createdAt)}</span>
                                        </div>
                                    </button>

                                    {/* actions */}
                                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                                        {canPreview && (
                                            <BaseButton.Icon
                                                variant="secondary"
                                                size="md"
                                                onClick={() => setPreviewDoc(doc)}
                                                aria-label={`Ver ${doc.name}`}
                                            >
                                                <Eye size={16} />
                                            </BaseButton.Icon>
                                        )}

                                        <BaseButton.Icon
                                            variant="secondary"
                                            size="md"
                                            onClick={() => setConfirmDownload(doc)}
                                            isDisabled={isDownloading || isDeleting}
                                            aria-label={`Descargar ${doc.name}`}
                                        >
                                            <Download size={16} />
                                        </BaseButton.Icon>

                                        <BaseButton.Icon
                                            variant="secondary"
                                            size="md"
                                            onClick={() => setConfirmDelete(doc)}
                                            isDisabled={isDeleting || isDownloading}
                                            aria-label={`Eliminar ${doc.name}`}
                                            className="hover:text-error hover:bg-error/5 hover:border-error/20"
                                        >
                                            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                        </BaseButton.Icon>
                                    </div>
                                </motion.li>
                            );
                        })}
                    </AnimatePresence>
                </ul>
            )}

            {/* ── bulk action bar ─────────────────────────────────── */}
            <AnimatePresence>
                {selectedCount > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.18, ease: [0.25, 1, 0.5, 1] }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] flex items-center gap-2 rounded-2xl border border-border-default bg-surface-1 shadow-xl px-3 py-2"
                        role="region"
                        aria-label="Acciones sobre selección"
                    >
                        <button
                            type="button"
                            onClick={clearSelection}
                            aria-label="Limpiar selección"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground hover:bg-surface-2 transition-colors"
                        >
                            <XIcon size={14} />
                        </button>
                        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-foreground tabular-nums px-1">
                            {selectedCount} seleccionado{selectedCount === 1 ? '' : 's'}
                        </span>
                        <div className="w-px h-6 bg-border-light" aria-hidden="true" />
                        <BaseButton.Root
                            variant="secondary"
                            size="sm"
                            onClick={handleBulkDownload}
                            isDisabled={bulkDownload || bulkDeleting}
                            leftIcon={bulkDownload ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        >
                            {bulkDownload ? 'Descargando…' : 'Descargar'}
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="dangerOutline"
                            size="sm"
                            onClick={() => setConfirmBulkDelete(true)}
                            isDisabled={bulkDeleting || bulkDownload}
                            leftIcon={bulkDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        >
                            {bulkDeleting ? 'Eliminando…' : 'Eliminar'}
                        </BaseButton.Root>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── dialogs ─────────────────────────────────────────── */}
            <AnimatePresence>
                {confirmDownload && (
                    <ConfirmDialog
                        title="Descargar documento"
                        message={`Se abrirá "${confirmDownload.name}" en una nueva pestaña. El enlace es temporal.`}
                        variant="default"
                        onConfirm={handleDownloadConfirmed}
                        onCancel={() => setConfirmDownload(null)}
                    />
                )}

                {confirmDelete && (
                    <ConfirmDialog
                        title="Eliminar documento"
                        message={`Se eliminará "${confirmDelete.name}" de forma permanente. Esta acción no se puede deshacer.`}
                        variant="danger"
                        onConfirm={handleDeleteConfirmed}
                        onCancel={() => setConfirmDelete(null)}
                    />
                )}

                {confirmBulkDelete && (
                    <ConfirmDialog
                        title={`Eliminar ${selectedCount} documento${selectedCount === 1 ? '' : 's'}`}
                        message={`Se eliminarán permanentemente ${selectedCount} archivo${selectedCount === 1 ? '' : 's'}. Esta acción no se puede deshacer.`}
                        variant="danger"
                        onConfirm={handleBulkDelete}
                        onCancel={() => setConfirmBulkDelete(false)}
                    />
                )}

                {previewDoc && (
                    <ImagePreviewModal
                        doc={previewDoc}
                        onDownload={onDownload}
                        onClose={() => setPreviewDoc(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

// ── small UI atoms ────────────────────────────────────────────────────────────

function SortButton({
    label, active, dir, onClick,
}: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
    const ArrowIcon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={[
                'inline-flex items-center gap-1 px-2.5 h-7 rounded-md font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                active
                    ? 'bg-primary-500/10 text-primary-600 font-bold'
                    : 'text-[var(--text-secondary)] hover:text-foreground hover:bg-surface-2',
            ].join(' ')}
        >
            {label}
            <ArrowIcon size={11} strokeWidth={2.2} />
        </button>
    );
}

function KindChip({
    label, count, active, onClick, tint,
}: {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
    tint?: 'primary' | 'error' | 'success';
}) {
    const tintClass =
        tint === 'primary' ? 'text-primary-500'
      : tint === 'error'   ? 'text-error'
      : tint === 'success' ? 'text-text-success'
      : '';

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={[
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border font-mono text-[11px] uppercase tracking-[0.1em] transition-colors',
                active
                    ? 'bg-primary-500/10 border-primary-500/30 text-primary-600'
                    : 'bg-surface-1 border-border-light text-[var(--text-secondary)] hover:border-border-medium hover:text-foreground',
            ].join(' ')}
        >
            {active && <CheckCircle2 size={11} strokeWidth={2.2} className={active ? 'text-primary-500' : tintClass} />}
            <span>{label}</span>
            <span className="tabular-nums text-foreground/40 font-medium">{count}</span>
        </button>
    );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
    if (bytes < 1024)         return `${bytes} B`;
    if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}
