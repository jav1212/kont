"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, BellOff, Trash2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Modal, ModalContent, ModalBody } from "@heroui/react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import type { ReminderSubscription } from "@/src/modules/tools/seniat-reminders/backend/domain/reminder-subscription";

interface ReminderManagementPanelProps {
    open:          boolean;
    onOpenChange:  (open: boolean) => void;
}

export function ReminderManagementPanel({ open, onOpenChange }: ReminderManagementPanelProps) {
    const [subs, setSubs]       = useState<ReminderSubscription[]>([]);
    const [loading, setLoading] = useState(false);
    const [acting, setActing]   = useState<string | null>(null); // id of sub being toggled/deleted

    const fetchSubs = useCallback(async () => {
        setLoading(true);
        try {
            const res  = await fetch("/api/seniat-reminders/list");
            const json = await res.json() as { data?: ReminderSubscription[]; error?: string };
            if (!res.ok) {
                toast.error(json.error ?? "Error al cargar recordatorios.");
                return;
            }
            setSubs(json.data ?? []);
        } catch {
            toast.error("Error de red al cargar recordatorios.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) fetchSubs();
    }, [open, fetchSubs]);

    async function handleToggle(sub: ReminderSubscription) {
        setActing(sub.id);
        try {
            const res  = await fetch("/api/seniat-reminders/update", {
                method:  "PATCH",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ id: sub.id, enabled: !sub.enabled }),
            });
            const json = await res.json() as { data?: ReminderSubscription; error?: string };
            if (!res.ok) {
                toast.error(json.error ?? "Error al actualizar.");
                return;
            }
            setSubs((prev) =>
                prev.map((s) => s.id === sub.id ? { ...s, enabled: !s.enabled } : s)
            );
            toast.success(sub.enabled ? "Recordatorio pausado." : "Recordatorio activado.");
        } catch {
            toast.error("Error de red.");
        } finally {
            setActing(null);
        }
    }

    async function handleDelete(id: string) {
        setActing(id);
        try {
            const res  = await fetch("/api/seniat-reminders/unsubscribe", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ id }),
            });
            const json = await res.json() as { error?: string };
            if (!res.ok) {
                toast.error(json.error ?? "Error al eliminar.");
                return;
            }
            setSubs((prev) => prev.filter((s) => s.id !== id));
            toast.success("Recordatorio eliminado.");
        } catch {
            toast.error("Error de red.");
        } finally {
            setActing(null);
        }
    }

    return (
        <Modal
            isOpen={open}
            onOpenChange={onOpenChange}
            placement="center"
            classNames={{
                base:     "rounded-2xl border border-border-light bg-surface-1 shadow-xl max-w-[520px] w-full",
                backdrop: "backdrop-blur-sm bg-black/30",
            }}
        >
            <ModalContent>
                <ModalBody className="p-6">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-500 flex items-center justify-center dark:bg-primary-50/10">
                                <Bell size={15} strokeWidth={1.5} />
                            </div>
                            <h2 className="text-[16px] font-sans font-bold text-text-primary">
                                Mis recordatorios
                            </h2>
                        </div>
                        <button
                            onClick={() => void fetchSubs()}
                            disabled={loading}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:bg-surface-2 hover:text-text-primary transition-colors duration-150 disabled:opacity-40"
                            aria-label="Recargar"
                        >
                            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>

                    {/* Content */}
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 size={20} className="animate-spin text-text-tertiary" />
                        </div>
                    ) : subs.length === 0 ? (
                        <div className="text-center py-8">
                            <BellOff size={28} className="mx-auto mb-3 text-text-tertiary" strokeWidth={1.5} />
                            <p className="text-[13px] font-mono text-text-secondary">
                                No tienes recordatorios activos.
                            </p>
                        </div>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {subs.map((sub) => (
                                <li
                                    key={sub.id}
                                    className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-2 border border-border-light"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-mono font-semibold text-text-primary truncate">
                                            {sub.rif}
                                        </p>
                                        <p className="text-[11px] font-mono text-text-tertiary mt-0.5">
                                            {sub.taxpayerType === "especial" ? "Especial" : "Ordinario"}
                                            {" · "}
                                            {sub.daysBefore} día{sub.daysBefore !== 1 ? "s" : ""} antes
                                            {" · "}
                                            <span className={sub.enabled ? "text-green-500" : "text-text-tertiary"}>
                                                {sub.enabled ? "Activo" : "Pausado"}
                                            </span>
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                        {/* Toggle enable/disable */}
                                        <button
                                            onClick={() => void handleToggle(sub)}
                                            disabled={acting === sub.id}
                                            className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:bg-surface-3 hover:text-text-primary transition-colors duration-150 disabled:opacity-40"
                                            aria-label={sub.enabled ? "Pausar" : "Activar"}
                                            title={sub.enabled ? "Pausar recordatorio" : "Activar recordatorio"}
                                        >
                                            {acting === sub.id ? (
                                                <Loader2 size={13} className="animate-spin" />
                                            ) : sub.enabled ? (
                                                <Bell size={13} />
                                            ) : (
                                                <BellOff size={13} />
                                            )}
                                        </button>

                                        {/* Delete */}
                                        <button
                                            onClick={() => void handleDelete(sub.id)}
                                            disabled={acting === sub.id}
                                            className="w-7 h-7 rounded-md flex items-center justify-center text-text-tertiary hover:bg-red-500/10 hover:text-red-500 transition-colors duration-150 disabled:opacity-40"
                                            aria-label="Eliminar recordatorio"
                                            title="Eliminar recordatorio"
                                        >
                                            {acting === sub.id ? (
                                                <Loader2 size={13} className="animate-spin" />
                                            ) : (
                                                <Trash2 size={13} />
                                            )}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}

                    {/* Footer */}
                    <div className="mt-4">
                        <BaseButton.Root
                            variant="ghost"
                            fullWidth
                            onClick={() => onOpenChange(false)}
                        >
                            Cerrar
                        </BaseButton.Root>
                    </div>
                </ModalBody>
            </ModalContent>
        </Modal>
    );
}
