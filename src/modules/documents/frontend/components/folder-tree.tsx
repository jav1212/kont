"use client";
 
import { useState, useRef, useEffect, ReactNode } from 'react';
import { 
    Folder, 
    MoreVertical, 
    Trash2, 
    Plus, 
    X, 
    Check, 
    Loader2, 
    FolderPlus,
    ChevronRight
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
    onCreateFolder: (name: string, parentId?: string | null) => Promise<any>;
    onDeleteFolder: (id: string) => Promise<void>;
}
 
export function FolderTree({
    folders,
    selectedFolderId,
    onSelect,
    onCreateFolder,
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
    onDelete?: () => Promise<void>;
    isRoot?: boolean;
}
 
function FolderItem({ id, label, isSelected, onSelect, onDelete, isRoot }: FolderItemProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
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
 
            {!isRoot && onDelete && (
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
                                <BaseButton.Root
                                    onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                                    variant="ghost"
                                    size="sm"
                                    className="w-full flex items-center justify-start gap-2.5 px-4 py-2.5 text-left font-mono text-[11px] text-red-500 hover:bg-red-500/5 transition-colors active:bg-red-500/10 h-auto rounded-none"
                                    leftIcon={<Trash2 size={14} strokeWidth={2} />}
                                >
                                    Eliminar carpeta
                                </BaseButton.Root>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
}
