"use client";

import { useState } from 'react';
import type { Document } from '../../backend/domain/document';
import { APP_SIZES } from '@/src/shared/frontend/sizes';

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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />

            {/* Panel */}
            <div className="relative w-full max-w-sm rounded-xl border border-border-light bg-surface-1 shadow-xl p-5 flex flex-col gap-4">
                <div>
                    <h2 id="confirm-title" className={`font-mono ${APP_SIZES.nav.item} font-semibold text-foreground mb-1`}>
                        {title}
                    </h2>
                    <p className={`font-mono ${APP_SIZES.nav.sectionLabel} text-foreground/60`}>
                        {message}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 rounded-lg border border-border-light font-mono text-[11px] text-foreground/70 hover:text-foreground hover:bg-surface-2 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className={[
                            'flex-1 py-2.5 rounded-lg font-mono text-[11px] text-white transition-colors',
                            variant === 'danger'
                                ? 'bg-red-500 hover:bg-red-600'
                                : 'bg-primary-500 hover:bg-primary-600',
                        ].join(' ')}
                    >
                        {variant === 'danger' ? 'Eliminar' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DocumentList({ documents, loading, onDelete, onDownload }: DocumentListProps) {
    const [deletingId,    setDeletingId]    = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    // Confirm state
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

        // Abrir la ventana de forma SÍNCRONA antes del await para que iOS Safari
        // no lo bloquee como popup (el contexto del gesto del usuario se pierde después de await).
        const win = window.open('', '_blank');

        try {
            const url = await onDownload(id);
            if (win) {
                win.location.href = url;
            } else {
                // Fallback por si el navegador bloqueó la ventana
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
            <ul className="space-y-2">
                {[1, 2, 3].map((i) => (
                    <li key={i} className="h-14 rounded-lg bg-surface-2 animate-pulse" />
                ))}
            </ul>
        );
    }

    if (documents.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/20 mb-3" aria-hidden="true">
                    <rect x="8" y="4" width="24" height="32" rx="2" />
                    <path d="M14 14h12M14 20h12M14 26h7" />
                </svg>
                <p className={`font-mono ${APP_SIZES.nav.item} text-foreground/40`}>
                    No hay documentos — sube el primero
                </p>
            </div>
        );
    }

    return (
        <>
            <ul className="space-y-1.5" role="list" aria-label="Documentos">
                {documents.map((doc) => {
                    const isDeleting    = deletingId    === doc.id;
                    const isDownloading = downloadingId === doc.id;

                    return (
                        <li
                            key={doc.id}
                            className="flex items-center gap-3 px-3 py-3 rounded-lg border border-border-light bg-surface-1"
                        >
                            <FileIcon mimeType={doc.mimeType} />

                            <div className="flex-1 min-w-0">
                                <p className={`font-mono ${APP_SIZES.nav.item} text-foreground truncate`}>
                                    {doc.name}
                                </p>
                                <p className={`font-mono ${APP_SIZES.nav.sectionLabel} text-foreground/40`}>
                                    {doc.sizeBytes != null ? formatBytes(doc.sizeBytes) : ''}
                                    {doc.sizeBytes != null && ' · '}
                                    {formatDate(doc.createdAt)}
                                </p>
                            </div>

                            {/* Botones siempre visibles — tamaño mínimo 44px para touch */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={() => setConfirmDownload(doc)}
                                    disabled={isDownloading || isDeleting}
                                    aria-label={`Descargar ${doc.name}`}
                                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-foreground/50 hover:text-primary-500 hover:bg-primary-500/[0.08] active:bg-primary-500/[0.15] transition-colors disabled:opacity-40"
                                >
                                    {isDownloading ? <Spinner /> : <DownloadIcon />}
                                </button>

                                <button
                                    onClick={() => setConfirmDelete(doc)}
                                    disabled={isDeleting || isDownloading}
                                    aria-label={`Eliminar ${doc.name}`}
                                    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-foreground/50 hover:text-red-500 hover:bg-red-500/[0.05] active:bg-red-500/[0.12] transition-colors disabled:opacity-40"
                                >
                                    {isDeleting ? <Spinner /> : <TrashIcon />}
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>

            {/* ── Confirm: download ── */}
            {confirmDownload && (
                <ConfirmDialog
                    title="Descargar documento"
                    message={`¿Descargar "${confirmDownload.name}"?`}
                    variant="default"
                    onConfirm={handleDownloadConfirmed}
                    onCancel={() => setConfirmDownload(null)}
                />
            )}

            {/* ── Confirm: delete ── */}
            {confirmDelete && (
                <ConfirmDialog
                    title="Eliminar documento"
                    message={`Se eliminará "${confirmDelete.name}" de forma permanente. Esta acción no se puede deshacer.`}
                    variant="danger"
                    onConfirm={handleDeleteConfirmed}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </>
    );
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function Spinner() {
    return (
        <svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="7" cy="7" r="5.5" strokeDasharray="22 12" />
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7.5 1v9M4 8l3.5 3.5L11 8" />
            <path d="M1 14h13" />
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M2 4h11M5.5 4V3a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M12 4l-.7 8a1 1 0 0 1-1 .9H4.7a1 1 0 0 1-1-.9L3 4" />
        </svg>
    );
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
    const color = mimeType?.includes('pdf')    ? 'text-red-500'
                : mimeType?.includes('image')  ? 'text-blue-500'
                : mimeType?.includes('sheet') || mimeType?.includes('excel') ? 'text-green-600'
                : 'text-foreground/40';

    return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 ${color}`} aria-hidden="true">
            <path d="M5 2h8l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
            <path d="M13 2v4h4" />
        </svg>
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
