"use client";

// SidebarUpdateBanner — aparece en el footer del sidebar sólo cuando el SW
// detectó una versión nueva. Click → diálogo de confirmación → activa el SW
// nuevo y recarga la página.
//
// Estilo konta: container redondeado con border-sidebar-border, etiqueta mono
// uppercase 11px y CTA naranja (primary-500) full width. En modo collapsed
// muestra sólo el icono con un dot naranja arriba a la derecha.

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Modal, ModalContent, ModalBody } from "@heroui/react";

import { useServiceWorkerUpdate } from "@/src/shared/frontend/hooks/use-sw-update";
import { BaseButton } from "@/src/shared/frontend/components/base-button";

interface Props {
    collapsed?: boolean;
}

export function SidebarUpdateBanner({ collapsed = false }: Props) {
    const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
    const [confirmOpen, setConfirmOpen] = useState(false);

    if (!updateAvailable) return null;

    const handleConfirm = () => {
        setConfirmOpen(false);
        applyUpdate();
    };

    if (collapsed) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    aria-label="Nueva versión disponible. Actualizar app"
                    title="Nueva versión disponible"
                    className="relative flex items-center justify-center w-9 h-9 rounded-md bg-sidebar-bg-hover/60 border border-sidebar-border hover:bg-sidebar-bg-hover hover:border-border-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border text-primary-500"
                >
                    <RefreshCw size={16} strokeWidth={2} />
                    <span
                        aria-hidden="true"
                        className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary-500 ring-2 ring-sidebar-bg"
                    />
                </button>
                <UpdateConfirmDialog
                    isOpen={confirmOpen}
                    onClose={() => setConfirmOpen(false)}
                    onConfirm={handleConfirm}
                />
            </>
        );
    }

    return (
        <>
            <div
                className="rounded-lg border border-sidebar-border bg-sidebar-bg-hover/60 shadow-sm px-3 py-2.5 flex flex-col gap-2"
                role="status"
                aria-live="polite"
            >
                <div className="flex items-center gap-2">
                    <span className="shrink-0 w-5 h-5 flex items-center justify-center text-primary-500">
                        <RefreshCw size={14} strokeWidth={2} />
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-sidebar-fg-hover font-semibold">
                        Nueva versión
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="w-full h-8 rounded-md bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-mono text-[12px] uppercase tracking-[0.12em] font-semibold shadow-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                    Actualizar ahora
                </button>
            </div>
            <UpdateConfirmDialog
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleConfirm}
            />
        </>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// UpdateConfirmDialog — modal de confirmación previo al reload. Mismo
// lenguaje visual que ConfirmCompanyDialog (rounded-2xl, surface-1, mono
// uppercase header) pero más compacto porque no necesita company highlight.
// ────────────────────────────────────────────────────────────────────────────

interface DialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

function UpdateConfirmDialog({ isOpen, onClose, onConfirm }: DialogProps) {
    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={(open) => { if (!open) onClose(); }}
            placement="center"
            isDismissable
            hideCloseButton
            classNames={{
                base: "rounded-2xl border border-border-light bg-surface-1 shadow-xl max-w-[440px] w-full mx-4",
                backdrop: "backdrop-blur-sm bg-black/40",
            }}
        >
            <ModalContent>
                <ModalBody className="p-0">
                    {/* Header */}
                    <div className="px-6 pt-6 pb-4 border-b border-border-light flex items-start gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary-500/10 border border-primary-500/20 flex items-center justify-center text-primary-500 flex-shrink-0">
                            <RefreshCw size={16} strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="font-mono text-[15px] font-bold uppercase tracking-[0.14em] text-foreground leading-snug">
                                Actualizar aplicación
                            </h3>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                                Se recargará la página para aplicar la nueva versión. Guarda tu trabajo antes de continuar.
                            </p>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-border-light bg-surface-2/40 flex items-center justify-end gap-3">
                        <BaseButton.Root variant="secondary" size="md" onClick={onClose}>
                            Cancelar
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="primary"
                            size="md"
                            onClick={onConfirm}
                            leftIcon={<RefreshCw size={14} strokeWidth={2} />}
                        >
                            Recargar
                        </BaseButton.Root>
                    </div>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
