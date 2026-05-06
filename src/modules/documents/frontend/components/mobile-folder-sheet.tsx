"use client";

// MobileFolderSheet — bottom sheet con el árbol de carpetas para mobile/tablet.
//
// Reemplaza al drawer lateral izquierdo que competía visualmente con el drawer
// global del MobileTopBar. Sube desde abajo (movimiento opuesto) para que el
// usuario lo asocie inequívocamente con "opciones de esta pantalla".
//
// Reusa <FolderTree /> íntegro — incluye crear/renombrar/eliminar/mover.

import { Copy, Folders, Loader2, X } from "lucide-react";
import { motion } from "framer-motion";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { FolderTree } from "@/src/modules/documents/frontend/components/folder-tree";

interface FolderData {
    id:        string;
    name:      string;
    parentId?: string | null;
}

interface MobileFolderSheetProps {
    folders:           FolderData[];
    selectedFolderId:  string | null | undefined;
    onClose:           () => void;
    onSelectFolder:    (id: string | null) => void;
    onCreateFolder:    (name: string, parentId?: string | null) => Promise<unknown>;
    onRenameFolder:    (id: string, name: string) => Promise<unknown>;
    onDeleteFolder:    (id: string) => Promise<void>;
    onMoveDocuments?:  (docIds: string[], targetFolderId: string | null) => Promise<void> | void;
    onReplicate:       () => void;
    replicating:       boolean;
}

export function MobileFolderSheet({
    folders,
    selectedFolderId,
    onClose,
    onSelectFolder,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    onMoveDocuments,
    onReplicate,
    replicating,
}: MobileFolderSheetProps) {
    return (
        <div className="xl:hidden fixed inset-0 z-[100] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Seleccionar carpeta">
            {/* Overlay */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Sheet */}
            <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 280 }}
                className="relative flex flex-col bg-surface-1 border-t border-border-light rounded-t-2xl shadow-2xl"
                style={{ maxHeight: "85vh" }}
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-2.5 pb-1.5">
                    <span aria-hidden="true" className="block w-10 h-1 rounded-full bg-border-medium" />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-border-light">
                    <div className="flex items-center gap-2">
                        <Folders size={14} className="text-primary-500" />
                        <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Carpetas
                        </span>
                    </div>
                    <BaseButton.Icon
                        variant="secondary"
                        size="sm"
                        onClick={onClose}
                        aria-label="Cerrar"
                    >
                        <X size={16} />
                    </BaseButton.Icon>
                </div>

                {/* Tree */}
                <div className="flex-1 overflow-y-auto px-4 pt-3 pb-2">
                    <FolderTree
                        folders={folders}
                        selectedFolderId={selectedFolderId}
                        onSelect={(id) => { onSelectFolder(id); onClose(); }}
                        onCreateFolder={onCreateFolder}
                        onRenameFolder={onRenameFolder}
                        onDeleteFolder={onDeleteFolder}
                        onMoveDocuments={onMoveDocuments}
                    />
                </div>

                {/* Footer — replicate template */}
                <div
                    className="px-4 pt-3 border-t border-border-light bg-surface-2/30"
                    style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
                >
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={onReplicate}
                        isDisabled={replicating}
                        leftIcon={replicating ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
                        className="w-full text-[11px] font-mono border-dashed"
                    >
                        {replicating ? "Replicando…" : "Replicar plantilla"}
                    </BaseButton.Root>
                </div>
            </motion.div>
        </div>
    );
}
