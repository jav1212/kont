"use client";

import { useState } from 'react';
import type { Document } from '../../backend/domain/document';
import { APP_SIZES } from '@/src/shared/frontend/sizes';

interface DocumentListProps {
    documents:       Document[];
    loading:         boolean;
    onDelete:        (id: string) => Promise<void>;
    onDownload:      (id: string) => Promise<string>;
}

export function DocumentList({ documents, loading, onDelete, onDownload }: DocumentListProps) {
    const [deletingId,    setDeletingId]    = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);

    async function handleDelete(id: string) {
        setDeletingId(id);
        try { await onDelete(id); } finally { setDeletingId(null); }
    }

    async function handleDownload(id: string) {
        setDownloadingId(id);
        try {
            const url = await onDownload(id);
            window.open(url, '_blank', 'noopener');
        } finally {
            setDownloadingId(null);
        }
    }

    if (loading) {
        return (
            <ul className="space-y-2">
                {[1, 2, 3].map((i) => (
                    <li key={i} className="h-12 rounded-lg bg-surface-2 animate-pulse" />
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
        <ul className="space-y-1" role="list" aria-label="Documentos">
            {documents.map((doc) => (
                <li
                    key={doc.id}
                    className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border-light bg-surface-1 hover:bg-surface-2 transition-colors"
                >
                    <FileIcon mimeType={doc.mimeType} />

                    <div className="flex-1 min-w-0">
                        <p className={`font-mono ${APP_SIZES.nav.item} text-foreground truncate`}>
                            {doc.name}
                        </p>
                        <p className={`font-mono ${APP_SIZES.nav.sectionLabel} text-foreground/40`}>
                            {doc.sizeBytes != null ? formatBytes(doc.sizeBytes) : ''}
                            {doc.sizeBytes != null && '  ·  '}
                            {formatDate(doc.createdAt)}
                        </p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Download */}
                        <button
                            onClick={() => handleDownload(doc.id)}
                            disabled={downloadingId === doc.id}
                            aria-label={`Descargar ${doc.name}`}
                            className="p-1.5 rounded text-foreground/50 hover:text-primary-500 hover:bg-primary-500/[0.08] transition-colors disabled:opacity-50"
                        >
                            {downloadingId === doc.id ? (
                                <svg width="13" height="13" viewBox="0 0 13 13" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                    <circle cx="6.5" cy="6.5" r="5" strokeDasharray="20 12" />
                                </svg>
                            ) : (
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M6.5 1v8M3 7l3.5 3.5L10 7" />
                                    <path d="M1 12h11" />
                                </svg>
                            )}
                        </button>

                        {/* Delete */}
                        <button
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                            aria-label={`Eliminar ${doc.name}`}
                            className="p-1.5 rounded text-foreground/50 hover:text-red-500 hover:bg-red-500/[0.05] transition-colors disabled:opacity-50"
                        >
                            {deletingId === doc.id ? (
                                <svg width="13" height="13" viewBox="0 0 13 13" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                                    <circle cx="6.5" cy="6.5" r="5" strokeDasharray="20 12" />
                                </svg>
                            ) : (
                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M2 3.5h9M4.5 3.5V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M10.5 3.5l-.6 7a1 1 0 0 1-1 .9H4.1a1 1 0 0 1-1-.9l-.6-7" />
                                </svg>
                            )}
                        </button>
                    </div>
                </li>
            ))}
        </ul>
    );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number) {
    if (bytes < 1024)           return `${bytes} B`;
    if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
    const color = mimeType?.includes('pdf')
        ? 'text-red-500'
        : mimeType?.includes('image')
        ? 'text-blue-500'
        : mimeType?.includes('sheet') || mimeType?.includes('excel')
        ? 'text-green-600'
        : 'text-foreground/40';

    return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={`flex-shrink-0 ${color}`} aria-hidden="true">
            <path d="M4 2h7l4 4v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
            <path d="M11 2v4h4" />
        </svg>
    );
}
