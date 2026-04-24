"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import {
    Folder,
    FolderOpen,
    MoreVertical,
    Trash2,
    Pencil,
    X,
    Check,
    Loader2,
    FolderPlus,
    ChevronRight,
    FolderDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BaseButton } from '@/src/shared/frontend/components/base-button';
import { BaseInput } from '@/src/shared/frontend/components/base-input';

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
    /** Called when one or more documents are dropped onto a folder row. */
    onMoveDocuments?: (docIds: string[], targetFolderId: string | null) => Promise<void> | void;
}

// Shared MIME type with DocumentList — duplicated here to avoid a circular import.
const DOC_DRAG_MIME = 'application/x-kont-docs';

function readDropIds(e: React.DragEvent): string[] {
    try {
        const json = e.dataTransfer.getData(DOC_DRAG_MIME);
        if (json) {
            const parsed = JSON.parse(json);
            if (Array.isArray(parsed?.ids)) return parsed.ids as string[];
        }
    } catch {
        /* fall through */
    }
    const fallback = e.dataTransfer.getData('text/plain');
    return fallback ? fallback.split(',').filter(Boolean) : [];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildChildMap(folders: FolderData[]) {
    const map = new Map<string | null, FolderData[]>();
    for (const f of folders) {
        const key = f.parentId ?? null;
        const arr = map.get(key);
        if (arr) arr.push(f);
        else map.set(key, [f]);
    }
    for (const arr of map.values()) {
        arr.sort((a, b) => a.name.localeCompare(b.name, 'es-VE'));
    }
    return map;
}

function collectAncestors(
    folders: FolderData[],
    targetId: string | null | undefined,
): Set<string> {
    const out = new Set<string>();
    if (!targetId) return out;
    const byId = new Map(folders.map((f) => [f.id, f] as const));
    let cur = byId.get(targetId);
    while (cur?.parentId) {
        out.add(cur.parentId);
        cur = byId.get(cur.parentId);
    }
    return out;
}

// ── component ─────────────────────────────────────────────────────────────────

export function FolderTree({
    folders,
    selectedFolderId,
    onSelect,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveDocuments,
}: FolderTreeProps) {
    const [rootCreating, setRootCreating] = useState(false);
    const [rootName,     setRootName]     = useState('');
    const [savingRoot,   setSavingRoot]   = useState(false);

    // Expanded folders state — open by default if an ancestor of the selected one
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const childMap = useMemo(() => buildChildMap(folders), [folders]);

    // Ensure ancestors of the currently selected folder are expanded
    useEffect(() => {
        if (!selectedFolderId) return;
        const ancestors = collectAncestors(folders, selectedFolderId);
        if (ancestors.size === 0) return;
        setExpanded((prev) => {
            const next = new Set(prev);
            let changed = false;
            for (const id of ancestors) {
                if (!next.has(id)) { next.add(id); changed = true; }
            }
            return changed ? next : prev;
        });
    }, [selectedFolderId, folders]);

    const toggleExpand = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    async function handleCreateRoot(e: React.FormEvent) {
        e.preventDefault();
        if (!rootName.trim() || savingRoot) return;
        setSavingRoot(true);
        try {
            await onCreateFolder(rootName.trim());
            setRootName('');
            setRootCreating(false);
        } finally {
            setSavingRoot(false);
        }
    }

    const rootFolders = childMap.get(null) ?? [];

    return (
        <div className="flex flex-col gap-1.5 h-full">
            <div className="space-y-0.5">
                <FolderItem
                    id="all"
                    label="Todos los documentos"
                    depth={0}
                    isSelected={!selectedFolderId}
                    onSelect={() => onSelect(null)}
                    hasChildren={false}
                    isExpanded={false}
                    isRoot
                    onDropDocuments={onMoveDocuments ? (ids) => onMoveDocuments(ids, null) : undefined}
                />

                {rootFolders.map((f) => (
                    <FolderBranch
                        key={f.id}
                        folder={f}
                        depth={0}
                        childMap={childMap}
                        selectedFolderId={selectedFolderId ?? null}
                        expanded={expanded}
                        onToggleExpand={toggleExpand}
                        onSelect={onSelect}
                        onCreateFolder={onCreateFolder}
                        onRenameFolder={onRenameFolder}
                        onDeleteFolder={onDeleteFolder}
                        onMoveDocuments={onMoveDocuments}
                    />
                ))}
            </div>

            <div className="mt-2 pt-2 border-t border-border-light/40">
                {rootCreating ? (
                    <motion.form
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        onSubmit={handleCreateRoot}
                        className="p-3 rounded-2xl bg-surface-2/50 border border-primary-500/20 shadow-sm space-y-3"
                    >
                        <BaseInput.Field
                            autoFocus
                            type="text"
                            placeholder="Nombre de la carpeta…"
                            value={rootName}
                            onValueChange={setRootName}
                        />
                        <div className="flex gap-2">
                            <BaseButton.Root
                                type="submit"
                                variant="primary"
                                size="sm"
                                isDisabled={savingRoot || !rootName.trim()}
                                className="flex-1 font-mono"
                                leftIcon={savingRoot ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                            >
                                {savingRoot ? 'Creando…' : 'Crear'}
                            </BaseButton.Root>
                            <BaseButton.Root
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => { setRootCreating(false); setRootName(''); }}
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
                        onClick={() => setRootCreating(true)}
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

// ── recursive branch ──────────────────────────────────────────────────────────

interface FolderBranchProps {
    folder: FolderData;
    depth: number;
    childMap: Map<string | null, FolderData[]>;
    selectedFolderId: string | null;
    expanded: Set<string>;
    onToggleExpand: (id: string) => void;
    onSelect: (id: string | null) => void;
    onCreateFolder: (name: string, parentId?: string | null) => Promise<unknown>;
    onRenameFolder: (id: string, name: string) => Promise<unknown>;
    onDeleteFolder: (id: string) => Promise<void>;
    onMoveDocuments?: (docIds: string[], targetFolderId: string | null) => Promise<void> | void;
}

function FolderBranch({
    folder,
    depth,
    childMap,
    selectedFolderId,
    expanded,
    onToggleExpand,
    onSelect,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveDocuments,
}: FolderBranchProps) {
    const children    = childMap.get(folder.id) ?? [];
    const hasChildren = children.length > 0;
    const isOpen      = expanded.has(folder.id);
    const isSelected  = selectedFolderId === folder.id;

    const [creatingSub, setCreatingSub] = useState(false);
    const [subName,     setSubName]     = useState('');
    const [savingSub,   setSavingSub]   = useState(false);

    async function handleCreateSub(e: React.FormEvent) {
        e.preventDefault();
        if (!subName.trim() || savingSub) return;
        setSavingSub(true);
        try {
            await onCreateFolder(subName.trim(), folder.id);
            setSubName('');
            setCreatingSub(false);
            // auto-expand parent after creating a sub-folder
            if (!isOpen) onToggleExpand(folder.id);
        } finally {
            setSavingSub(false);
        }
    }

    return (
        <div>
            <FolderItem
                id={folder.id}
                label={folder.name}
                depth={depth}
                isSelected={isSelected}
                hasChildren={hasChildren}
                isExpanded={isOpen}
                onSelect={() => onSelect(folder.id)}
                onToggle={() => onToggleExpand(folder.id)}
                onRename={(name) => onRenameFolder(folder.id, name)}
                onDelete={() => onDeleteFolder(folder.id)}
                onCreateSub={() => setCreatingSub(true)}
                onDropDocuments={onMoveDocuments ? (ids) => onMoveDocuments(ids, folder.id) : undefined}
            />

            <AnimatePresence initial={false}>
                {isOpen && (hasChildren || creatingSub) && (
                    <motion.div
                        key="children"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-0.5 pt-0.5">
                            {children.map((child) => (
                                <FolderBranch
                                    key={child.id}
                                    folder={child}
                                    depth={depth + 1}
                                    childMap={childMap}
                                    selectedFolderId={selectedFolderId}
                                    expanded={expanded}
                                    onToggleExpand={onToggleExpand}
                                    onSelect={onSelect}
                                    onCreateFolder={onCreateFolder}
                                    onRenameFolder={onRenameFolder}
                                    onDeleteFolder={onDeleteFolder}
                                    onMoveDocuments={onMoveDocuments}
                                />
                            ))}

                            {creatingSub && (
                                <motion.form
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    onSubmit={handleCreateSub}
                                    className="mx-1 my-1 p-2.5 rounded-xl bg-surface-2/60 border border-primary-500/20 space-y-2"
                                    style={{ marginLeft: `${(depth + 1) * 12 + 4}px` }}
                                >
                                    <BaseInput.Field
                                        autoFocus
                                        type="text"
                                        placeholder="Subcarpeta…"
                                        value={subName}
                                        onValueChange={setSubName}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Escape') {
                                                setCreatingSub(false);
                                                setSubName('');
                                            }
                                        }}
                                    />
                                    <div className="flex gap-1.5">
                                        <BaseButton.Root
                                            type="submit"
                                            variant="primary"
                                            size="sm"
                                            isDisabled={savingSub || !subName.trim()}
                                            className="flex-1 font-mono"
                                            leftIcon={savingSub ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                        >
                                            {savingSub ? 'Creando…' : 'Crear'}
                                        </BaseButton.Root>
                                        <BaseButton.Root
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => { setCreatingSub(false); setSubName(''); }}
                                            className="px-2"
                                        >
                                            <X size={12} />
                                        </BaseButton.Root>
                                    </div>
                                </motion.form>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ── single folder row ─────────────────────────────────────────────────────────

interface FolderItemProps {
    id: string;
    label: string;
    depth: number;
    isSelected: boolean;
    hasChildren: boolean;
    isExpanded: boolean;
    onSelect: () => void;
    onToggle?: () => void;
    onRename?: (name: string) => Promise<unknown>;
    onDelete?: () => Promise<void>;
    onCreateSub?: () => void;
    onDropDocuments?: (docIds: string[]) => Promise<void> | void;
    isRoot?: boolean;
}

function FolderItem({
    label,
    depth,
    isSelected,
    hasChildren,
    isExpanded,
    onSelect,
    onToggle,
    onRename,
    onDelete,
    onCreateSub,
    onDropDocuments,
    isRoot,
}: FolderItemProps) {
    const [menuOpen,   setMenuOpen]   = useState(false);
    const [editing,    setEditing]    = useState(false);
    const [editName,   setEditName]   = useState(label);
    const [saving,     setSaving]     = useState(false);
    const [deleting,   setDeleting]   = useState(false);
    const [dropHover,  setDropHover]  = useState(false);
    const menuRef     = useRef<HTMLDivElement>(null);
    const inputRef    = useRef<HTMLInputElement>(null);
    const dropCounter = useRef(0);

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
        setEditName(label);
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

    const indent = depth * 12;

    if (editing) {
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1 px-1"
                style={{ paddingLeft: `${indent + 4}px` }}
            >
                <BaseInput.Field
                    ref={inputRef}
                    type="text"
                    value={editName}
                    onValueChange={setEditName}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') cancelEdit();
                        if (e.key === 'Enter') { e.preventDefault(); void saveRename(); }
                    }}
                    className="flex-1 min-w-0"
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

    const FolderIcon = isSelected ? FolderOpen : Folder;

    const dropEnabled = !!onDropDocuments;

    return (
        <div
            className={[
                'group relative flex items-center gap-0.5 rounded-xl transition-colors',
                dropHover ? 'ring-2 ring-primary-500/60 ring-inset bg-primary-500/10' : '',
            ].join(' ')}
            style={{ paddingLeft: `${indent}px` }}
            onDragEnter={dropEnabled ? (e) => {
                if (!e.dataTransfer.types.includes(DOC_DRAG_MIME) && !e.dataTransfer.types.includes('text/plain')) return;
                e.preventDefault();
                dropCounter.current += 1;
                setDropHover(true);
            } : undefined}
            onDragLeave={dropEnabled ? (e) => {
                e.preventDefault();
                dropCounter.current -= 1;
                if (dropCounter.current <= 0) {
                    dropCounter.current = 0;
                    setDropHover(false);
                }
            } : undefined}
            onDragOver={dropEnabled ? (e) => {
                if (!e.dataTransfer.types.includes(DOC_DRAG_MIME) && !e.dataTransfer.types.includes('text/plain')) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            } : undefined}
            onDrop={dropEnabled ? async (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropCounter.current = 0;
                setDropHover(false);
                const ids = readDropIds(e);
                if (ids.length === 0) return;
                await onDropDocuments?.(ids);
            } : undefined}
        >
            {/* Chevron (or spacer) */}
            {!isRoot && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (hasChildren) onToggle?.();
                    }}
                    aria-label={hasChildren ? (isExpanded ? 'Colapsar carpeta' : 'Expandir carpeta') : undefined}
                    aria-hidden={!hasChildren}
                    tabIndex={hasChildren ? 0 : -1}
                    className={[
                        'flex-shrink-0 flex items-center justify-center w-5 h-7 rounded-md transition-colors',
                        hasChildren
                            ? 'text-foreground/40 hover:text-foreground hover:bg-surface-2 cursor-pointer'
                            : 'cursor-default opacity-0',
                    ].join(' ')}
                >
                    <ChevronRight
                        size={12}
                        strokeWidth={2.2}
                        className={`transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                    />
                </button>
            )}

            <BaseButton.Root
                onClick={onSelect}
                variant="ghost"
                size="sm"
                className={[
                    'flex-1 flex items-center justify-start gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all duration-150 font-mono text-[12px] h-auto border border-transparent',
                    isSelected
                        ? 'text-primary-600 bg-primary-500/10 font-bold border-primary-500/20'
                        : 'text-foreground/70 hover:text-foreground hover:bg-surface-2',
                ].join(' ')}
                leftIcon={
                    <FolderIcon
                        size={15}
                        className={isSelected ? 'text-primary-500 fill-primary-500/20' : 'text-foreground/40'}
                    />
                }
            >
                <span className="truncate flex-1">{label}</span>
            </BaseButton.Root>

            {!isRoot && (onDelete ?? onRename ?? onCreateSub) && (
                <div className="absolute right-1 flex-shrink-0" ref={menuRef}>
                    <BaseButton.Icon
                        variant="secondary"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
                        isDisabled={deleting}
                        className={`transition-all ${
                            menuOpen ? 'opacity-100 bg-surface-2 text-foreground' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
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
                                className="absolute right-0 top-full mt-1 z-[60] w-52 rounded-2xl border border-border-light bg-surface-1 shadow-xl py-1.5 overflow-hidden"
                            >
                                {onCreateSub && (
                                    <BaseButton.Root
                                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onCreateSub(); }}
                                        variant="ghost"
                                        size="sm"
                                        className="w-full flex items-center justify-start gap-2.5 px-4 py-2.5 text-left font-mono text-[11px] hover:bg-surface-2 transition-colors h-auto rounded-none"
                                        leftIcon={<FolderDown size={14} strokeWidth={2} className="text-primary-500" />}
                                    >
                                        Nueva subcarpeta
                                    </BaseButton.Root>
                                )}
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
                                        className="w-full flex items-center justify-start gap-2.5 px-4 py-2.5 text-left font-mono text-[11px] text-error hover:bg-error/5 transition-colors active:bg-error/10 h-auto rounded-none"
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
