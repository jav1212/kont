"use client";

import { useState, useRef, useEffect } from 'react';
import {
    Folder,
    MoreVertical,
    Trash2,
    Pencil,
    X,
    Check,
    Loader2,
    FolderPlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BaseButton } from '@/src/shared/frontend/components/base-button';

interface FolderData {
    id: string;
    name: string;
    parentId?: string | null;
}

interface FolderTreeProps {
    folders: FolderData[];
    selectedFolderId?: string | null;
    onSelect: (id: string | null) => void;
    onCreateFolder: (name: string, parentId?: string | null) => Promise<unknown>;
    onRenameFolder: (id: string, name: string) => Promise<unknown>;
    onDeleteFolder: (id: string) => Promise<void>;
}

export function FolderTree({
    folders,
    selectedFolderId,
    onSelect,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
}: FolderTreeProps) {
    const [creating, setCreating] = useState(false);
    const [newName, setNewName]   = useState('');
    const [saving, setSaving]     = useState(false);

    const rootFolders = folders.filter((f) => !f.parentId);

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (!newName.trim() || saving) return;
        setSaving(true);
        try {
            await onCreateFolder(newName.trim());
            setNewName('');
            setCreating(false);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="flex flex-col gap-1.5 h-full">
            <div className="space-y-1">
                <FolderItem
                    id="all"
                    label="Todos los documentos"
                    isSelected={!selectedFolderId}
                    onSelect={() => onSelect(null)}
                    isRoot
                />

                {rootFolders.map((f) => (
                    <FolderItem
                        key={f.id}
                        id={f.id}
                        label={f.name}
                        isSelected={selectedFolderId === f.id}
                        onSelect={() => onSelect(f.id)}
                        onRename={(name) => onRenameFolder(f.id, name)}
                        onDelete={() => onDeleteFolder(f.id)}
                    />
                ))}
            </div>

            <div className="mt-2 pt-2 border-t border-border-light/40">
                {creating ? (
                    <motion.form
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        onSubmit={handleCreate}
                        className="p-3 rounded-2xl bg-surface-2/50 border border-primary-500/20 shadow-sm space-y-3"
                    >
                        <input
                            autoFocus
                            type="text"
                            placeholder="Nombre de la carpeta…"
                            className="w-full bg-surface-1 border border-border-light rounded-xl px-3 py-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary-500/30 transition-shadow transition-colors"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                        />
                        <div className="flex gap-2">
                            <BaseButton.Root
                                type="submit"
                                variant="primary"
                                size="sm"
                                isDisabled={saving || !newName.trim()}
                                className="flex-1 font-mono"
                                leftIcon={saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            >
                                {saving ? 'Creando…' : 'Crear'}
                            </BaseButton.Root>
                            <BaseButton.Root
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => { setCreating(false); setNewName(''); }}
                                className="px-2"
                            >
                                <X size={12} />
                            </BaseButton.Root>
                        </div>
                    </motion.form>
                ) : (
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={() => setCreating(true)}
                        className="w-full border-dashed border-border-medium hover:border-primary-500/40 hover:bg-primary-500/[0.04] text-[11px] font-mono mb-2"
                        leftIcon={<FolderPlus size={14} className="text-primary-500" />}
                    >
                        Nueva carpeta
                    </BaseButton.Root>
                )}
            </div>
        </div>
    );
}

interface FolderItemProps {
    id: string;
    label: string;
    isSelected: boolean;
    onSelect: () => void;
    onRename?: (name: string) => Promise<unknown>;
    onDelete?: () => Promise<void>;
    isRoot?: boolean;
}

function FolderItem({ label, isSelected, onSelect, onRename, onDelete, isRoot }: FolderItemProps) {
    const [menuOpen,   setMenuOpen]   = useState(false);
    const [editing,    setEditing]    = useState(false);
    const [editName,   setEditName]   = useState(label);
    const [saving,     setSaving]     = useState(false);
    const [deleting,   setDeleting]   = useState(false);
    const menuRef  = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        function handler(e: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    useEffect(() => {
        if (editing) inputRef.current?.focus();
    }, [editing]);

    async function handleDelete() {
        setMenuOpen(false);
        setDeleting(true);
        try { await onDelete?.(); } finally { setDeleting(false); }
    }

    function startEdit() {
        setMenuOpen(false);
        setEditName(label); // ensure edit buffer matches current label
        setEditing(true);
    }

    async function saveRename() {
        const trimmed = editName.trim();
        if (!trimmed || saving) return;
        if (trimmed === label) { cancelEdit(); return; }
        setSaving(true);
        try {
            await onRename?.(trimmed);
            setEditing(false);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Error al renombrar carpeta');
        } finally {
            setSaving(false);
        }
    }

    function cancelEdit() {
        setEditing(false);
        setEditName(label);
    }

    // Inline edit mode — uses native buttons to guarantee onClick fires
    if (editing) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1 px-1"
            >
                <input
                    ref={inputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') cancelEdit();
                        if (e.key === 'Enter') { e.preventDefault(); void saveRename(); }
                    }}
                    className="flex-1 bg-surface-1 border border-primary-500/40 rounded-lg px-2 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary-500/30 min-w-0"
                    aria-label={`Renombrar carpeta ${label}`}
                />
                <button
                    type="button"
                    onClick={() => void saveRename()}
                    disabled={saving || !editName.trim()}
                    aria-label="Guardar nombre"
                    className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                </button>
                <button
                    type="button"
                    onClick={cancelEdit}
                    aria-label="Cancelar edición"
                    className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg border border-border-light bg-surface-2 hover:bg-neutral-100 transition-colors"
                >
                    <X size={12} />
                </button>
            </motion.div>
        );
    }

    return (
        <div className="group relative flex items-center gap-1">
            <BaseButton.Root
                onClick={onSelect}
                variant="ghost"
                size="sm"
                className={[
                    'flex-1 flex items-center justify-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-300 font-mono text-[12px] h-auto border border-transparent',
                    isSelected
                        ? 'text-primary-600 bg-primary-500/10 font-bold border-primary-500/20'
                        : 'text-foreground/70 hover:text-foreground hover:bg-surface-2',
                ].join(' ')}
                leftIcon={
                    <Folder
                        size={16}
                        className={isSelected ? 'text-primary-500 fill-primary-500/20' : 'text-foreground/30'}
                    />
                }
            >
                <span className="truncate flex-1">{label}</span>
            </BaseButton.Root>

            {!isRoot && (onDelete ?? onRename) && (
                <div className="absolute right-1 flex-shrink-0" ref={menuRef}>
                    <BaseButton.Icon
                        variant="secondary"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                        isDisabled={deleting}
                        className={`transition-all ${
                            menuOpen ? 'opacity-100 bg-surface-2 text-foreground' : 'opacity-0 group-hover:opacity-100'
                        }`}
                        aria-label={`Opciones de ${label}`}
                    >
                        {deleting ? <Loader2 size={12} className="animate-spin" /> : <MoreVertical size={14} />}
                    </BaseButton.Icon>

                    <AnimatePresence>
                        {menuOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                className="absolute right-0 top-full mt-1 z-[60] w-48 rounded-2xl border border-border-light bg-surface-1 shadow-xl py-1.5 overflow-hidden"
                            >
                                {onRename && (
                                    <BaseButton.Root
                                        onClick={(e) => { e.stopPropagation(); startEdit(); }}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full flex items-center justify-start gap-2.5 px-4 py-2.5 text-left font-mono text-[11px] hover:bg-surface-2 transition-colors h-auto rounded-none"
                                        leftIcon={<Pencil size={14} strokeWidth={2} />}
                                    >
                                        Renombrar
                                    </BaseButton.Root>
                                )}
                                {onDelete && (
                                    <BaseButton.Root
                                        onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full flex items-center justify-start gap-2.5 px-4 py-2.5 text-left font-mono text-[11px] text-red-500 hover:bg-red-500/5 transition-colors active:bg-red-500/10 h-auto rounded-none"
                                        leftIcon={<Trash2 size={14} strokeWidth={2} />}
                                    >
                                        Eliminar carpeta
                                    </BaseButton.Root>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
