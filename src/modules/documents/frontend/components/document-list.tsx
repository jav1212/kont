"use client";
 
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    FileText, 
    FileImage, 
    FileSpreadsheet, 
    File as FileIconLucide, 
    Download, 
    Trash2, 
    ChevronRight,
    Loader2,
    FileMinus
} from 'lucide-react';
import type { Document } from '../../backend/domain/document';
import { BaseButton } from '@/src/shared/frontend/components/base-button';
 
interface DocumentListProps {
    documents:  Document[];
    loading:    boolean;
    onDelete:   (id: string) => Promise<void>;
    onDownload: (id: string) => Promise<string>;
}
 
// ── Confirm dialog ─────────────────────────────────────────────────────────────
 
interface ConfirmDialogProps {
    title:    string;
    message:  string;
    variant:  'danger' | 'default';
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
                        variant === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-primary-500/10 text-primary-500'
                    }`}>
                        {variant === 'danger' ? <Trash2 size={24} /> : <Download size={24} />}
                    </div>
                    
                    <h2 id="confirm-title" className="text-[15px] font-semibold text-foreground mb-1">
                        {title}
                    </h2>
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
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
                        variant="primary"
                        size="sm"
                        onClick={onConfirm}
                        className={`flex-1 ${variant === 'danger' ? 'bg-red-500 hover:bg-red-600 border-red-500 hover:border-red-600' : ''}`}
                    >
                        {variant === 'danger' ? 'Eliminar' : 'Confirmar'}
                    </BaseButton.Root>
                </div>
            </motion.div>
        </div>
    );
}
 
// ── Main component ─────────────────────────────────────────────────────────────
 
export function DocumentList({ documents, loading, onDelete, onDownload }: DocumentListProps) {
    const [deletingId,    setDeletingId]    = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
 
    const [confirmDelete,   setConfirmDelete]   = useState<Document | null>(null);
    const [confirmDownload, setConfirmDownload] = useState<Document | null>(null);
 
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
            if (win) {
                win.location.href = url;
            } else {
                window.location.href = url;
            }
        } catch (err) {
            win?.close();
            throw err;
        } finally {
            setDownloadingId(null);
        }
    }
 
    if (loading) {
        return (
            <ul className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                    <li key={i} className="h-[72px] rounded-2xl bg-surface-1 border border-border-light/50 flex items-center px-4 gap-4 animate-pulse">
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
 
    if (documents.length === 0) {
        return (
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
            >
                <div className="w-16 h-16 rounded-3xl bg-surface-1 border border-border-light flex items-center justify-center mb-4 shadow-sm">
                    <FileMinus className="text-foreground/20" size={32} />
                </div>
                <p className="text-[14px] font-medium text-foreground mb-1">
                    No hay documentos
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)] max-w-[200px]">
                    Sube tu primer archivo para empezar a gestionar tus documentos.
                </p>
            </motion.div>
        );
    }
 
    return (
        <>
            <ul className="space-y-2" role="list" aria-label="Documentos">
                <AnimatePresence mode="popLayout">
                    {documents.map((doc) => {
                        const isDeleting    = deletingId    === doc.id;
                        const isDownloading = downloadingId === doc.id;
    
                        return (
                            <motion.li
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                key={doc.id}
                                className="group flex items-center gap-4 px-4 py-3.5 rounded-2xl border border-border-light bg-surface-1 hover:border-primary-500/30 hover:shadow-lg hover:shadow-primary-500/5 transition-all duration-200"
                            >
                                <div className="relative">
                                    <FileIconType mimeType={doc.mimeType} />
                                    {isDownloading && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-surface-1/80 rounded-xl">
                                            <Loader2 size={16} className="animate-spin text-primary-500" />
                                        </div>
                                    )}
                                </div>
    
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-foreground truncate group-hover:text-primary-600 transition-colors">
                                        {doc.name}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <p className="text-[11px] text-[var(--text-tertiary)] font-mono">
                                            {doc.sizeBytes != null ? formatBytes(doc.sizeBytes) : ''}
                                        </p>
                                        <span className="w-1 h-1 rounded-full bg-border-medium" />
                                        <p className="text-[11px] text-[var(--text-tertiary)]">
                                            {formatDate(doc.createdAt)}
                                        </p>
                                    </div>
                                </div>
    
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                        className="hover:text-red-500 hover:bg-red-500/5 hover:border-red-500/20"
                                    >
                                        {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                    </BaseButton.Icon>
                                </div>

                                <div className="group-hover:hidden flex items-center gap-1 text-[var(--text-tertiary)]">
                                    <ChevronRight size={16} />
                                </div>
                            </motion.li>
                        );
                    })}
                </AnimatePresence>
            </ul>
 
            <AnimatePresence>
                {confirmDownload && (
                    <ConfirmDialog
                        title="Descargar documento"
                        message={`¿Estás seguro que deseas descargar "${confirmDownload.name}"?`}
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
            </AnimatePresence>
        </>
    );
}
 
// ── Icons ──────────────────────────────────────────────────────────────────────
 
function FileIconType({ mimeType }: { mimeType: string | null }) {
    const isPdf   = mimeType?.includes('pdf');
    const isImage = mimeType?.includes('image');
    const isSheet = mimeType?.includes('sheet') || mimeType?.includes('excel');

    const Icon = isPdf ? FileText : isImage ? FileImage : isSheet ? FileSpreadsheet : FileIconLucide;
    
    const colorClass = isPdf ? 'text-red-500 bg-red-500/5 border-red-500/10' 
                   : isImage ? 'text-blue-500 bg-blue-500/5 border-blue-500/10'
                   : isSheet ? 'text-green-600 bg-green-500/5 border-green-500/10'
                   : 'text-[var(--text-secondary)] bg-surface-2 border-border-light';

    return (
        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${colorClass}`}>
            <Icon size={20} />
        </div>
    );
}
 
// ── Helpers ────────────────────────────────────────────────────────────────────
 
function formatBytes(bytes: number) {
    if (bytes < 1024)         return `${bytes} B`;
    if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
 
function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}
