"use client";

import { useState, useRef, useEffect } from 'react';
import type { DocumentFolder } from '../../backend/domain/document-folder';

interface FolderTreeProps {
    folders:          DocumentFolder[];
    selectedFolderId: string | null;
    onSelect:         (folderId: string | null) => void;
    onCreateFolder:   (name: string, parentId: string | null) => Promise<unknown>;
    onDeleteFolder:   (id: string) => Promise<void>;
}

export function FolderTree({
    folders,
    selectedFolderId,
    onSelect,
    onCreateFolder,
    onDeleteFolder,
}: FolderTreeProps) {
    const [creating, setCreating]   = useState(false);
    const [newName,  setNewName]    = useState('');
    const [saving,   setSaving]     = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (creating) inputRef.current?.focus();
    }, [creating]);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim()) return;
        setSaving(true);
        try {
            await onCreateFolder(newName.trim(), null);
            setNewName('');
            setCreating(false);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex flex-col gap-1">
            {/* ── Nueva carpeta ── */}
            {creating ? (
                <form onSubmit={handleCreate} className="flex flex-col gap-1.5 mb-1">
                    <input
                        ref={inputRef}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && (setCreating(false), setNewName(''))}
                        placeholder="Nombre de la carpeta"
                        disabled={saving}
                        className="w-full px-2 py-1.5 rounded-lg border border-border-medium bg-surface-2 font-mono text-[11px] text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                    />
                    <div className="flex gap-1">
                        <button
                            type="submit"
                            disabled={saving || !newName.trim()}
                            className="flex-1 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-mono text-[11px] transition-colors disabled:opacity-50"
                        >
                            {saving ? '…' : 'Crear'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setCreating(false); setNewName(''); }}
                            className="px-3 py-1.5 rounded-lg border border-border-light text-foreground/50 hover:text-foreground font-mono text-[11px] transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                </form>
            ) : (
                <button
                    onClick={() => setCreating(true)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-border-medium text-foreground/40 hover:text-primary-500 hover:border-primary-500/40 hover:bg-primary-500/[0.04] font-mono text-[11px] transition-colors mb-1"
                >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                        <path d="M5.5 2v7M2 5.5h7" />
                    </svg>
                    Nueva carpeta
                </button>
            )}

            {/* ── Todos los documentos (raíz) ── */}
            <FolderItem
                label="Todos los documentos"
                isSelected={selectedFolderId === null}
                onSelect={() => onSelect(null)}
                isRoot
            />

            {/* ── Carpetas raíz ── */}
            {folders.filter((f) => f.parentId === null).map((folder) => (
                <FolderItem
                    key={folder.id}
                    label={folder.name}
                    isSelected={selectedFolderId === folder.id}
                    onSelect={() => onSelect(folder.id)}
                    onDelete={() => onDeleteFolder(folder.id)}
                />
            ))}
        </div>
    );
}

// ── Sub-component ──────────────────────────────────────────────────────────────

interface FolderItemProps {
    label:     string;
    isSelected: boolean;
    isRoot?:   boolean;
    onSelect:  () => void;
    onDelete?: () => Promise<void>;
}

function FolderItem({ label, isSelected, isRoot, onSelect, onDelete }: FolderItemProps) {
    const [menuOpen,   setMenuOpen]   = useState(false);
    const [deleting,   setDeleting]   = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        function handler(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    async function handleDelete() {
        setMenuOpen(false);
        setDeleting(true);
        try { await onDelete?.(); } finally { setDeleting(false); }
    }

    return (
        <div className="group flex items-center gap-0.5">
            <button
                onClick={onSelect}
                aria-current={isSelected ? 'page' : undefined}
                className={[
                    'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors duration-150 font-mono text-[11px]',
                    isSelected
                        ? 'text-primary-500 bg-primary-500/[0.08] font-medium'
                        : 'text-foreground/70 hover:text-foreground hover:bg-surface-2',
                ].join(' ')}
            >
                <FolderIcon filled={isSelected} />
                <span className="truncate">{label}</span>
            </button>

            {!isRoot && onDelete && (
                <div className="relative flex-shrink-0" ref={menuRef}>
                    <button
                        onClick={() => setMenuOpen((v) => !v)}
                        disabled={deleting}
                        aria-label={`Opciones de ${label}`}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-foreground/30 hover:text-foreground hover:bg-surface-2 transition-all disabled:opacity-50"
                    >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                            <circle cx="5.5" cy="2.5" r="0.7" fill="currentColor" stroke="none" />
                            <circle cx="5.5" cy="5.5" r="0.7" fill="currentColor" stroke="none" />
                            <circle cx="5.5" cy="8.5" r="0.7" fill="currentColor" stroke="none" />
                        </svg>
                    </button>
                    {menuOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-lg border border-border-light bg-surface-1 shadow-lg py-1">
                            <button
                                onClick={handleDelete}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] text-red-500 hover:bg-red-500/[0.05] transition-colors"
                            >
                                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M1.5 3h8M3.5 3V2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5v1M9 3l-.5 6a1 1 0 0 1-1 .9H3.5a1 1 0 0 1-1-.9L2 3" />
                                </svg>
                                Eliminar carpeta
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function FolderIcon({ filled }: { filled: boolean }) {
    return (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path
                d="M1 3.5A1 1 0 0 1 2 2.5h3l1 1.5h4a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3.5z"
                fill={filled ? 'currentColor' : 'none'}
                fillOpacity={filled ? 0.15 : 0}
                stroke="currentColor"
            />
        </svg>
    );
}
