"use client";

import { useState } from "react";
import { BellRing, Bell, X, Settings } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Modal, ModalContent, ModalBody } from "@heroui/react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { ReminderManagementPanel } from "./reminder-management-panel";
import type { TaxpayerType } from "@/src/modules/tools/seniat-calendar/data/types";

interface ReminderOptInProps {
    rif:          string;
    taxpayerType: TaxpayerType;
}

export function ReminderOptIn({ rif, taxpayerType }: ReminderOptInProps) {
    const [open, setOpen]             = useState(false);
    const [manageOpen, setManageOpen] = useState(false);
    const [loading, setLoading]       = useState(false);
    const { isAuthenticated, user }   = useAuth();

    async function handleSubmit() {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            const res = await fetch("/api/seniat-reminders/subscribe", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    rif,
                    taxpayerType,
                    categories: [],   // subscribe to all categories
                    daysBefore: 3,
                }),
            });

            const json = await res.json() as { data?: unknown; error?: string };

            if (!res.ok) {
                toast.error(json.error ?? "Error al activar recordatorios.");
                return;
            }

            toast.success("Recordatorios activados. Te avisaremos 3 días antes de cada vencimiento.");
            setOpen(false);
        } catch {
            toast.error("Error de red. Intenta de nuevo.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <BaseButton.Root
                variant="ghost"
                size="sm"
                onClick={() => setOpen(true)}
                leftIcon={<Bell size={12} />}
            >
                Recordatorios
            </BaseButton.Root>

            {/* ── Subscribe modal ── */}
            <Modal
                isOpen={open}
                onOpenChange={setOpen}
                placement="center"
                classNames={{
                    base:     "rounded-2xl border border-border-light bg-surface-1 shadow-xl max-w-[440px] w-full",
                    backdrop: "backdrop-blur-sm bg-black/30",
                }}
            >
                <ModalContent>
                    <ModalBody className="p-6">
                        {/* Close button */}
                        <button
                            onClick={() => setOpen(false)}
                            className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center text-text-tertiary hover:bg-surface-2 hover:text-text-primary transition-colors duration-150"
                            aria-label="Cerrar"
                        >
                            <X size={14} />
                        </button>

                        {/* Icon */}
                        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-500 flex items-center justify-center dark:bg-primary-50/10">
                            <BellRing size={20} strokeWidth={1.5} />
                        </div>

                        {/* Title */}
                        <h2 className="text-[18px] font-sans font-bold text-text-primary mt-4">
                            Recordatorios tributarios
                        </h2>

                        {!isAuthenticated ? (
                            <>
                                <p className="text-[13px] font-mono text-text-secondary leading-relaxed mt-2">
                                    Recibe alertas por email 3 días antes de cada vencimiento fiscal.
                                    Crea tu cuenta gratuita y activa recordatorios para el RIF{" "}
                                    <span className="font-bold text-text-primary">{rif}</span>.
                                </p>

                                <div className="flex flex-col gap-2 mt-6">
                                    <BaseButton.Root
                                        as={Link}
                                        href={`/sign-up?ref=seniat-calendar&rif=${encodeURIComponent(rif)}`}
                                        variant="primary"
                                        fullWidth
                                    >
                                        Crear cuenta gratis
                                    </BaseButton.Root>
                                    <BaseButton.Root
                                        as={Link}
                                        href={`/sign-in?redirect=/herramientas/calendario-seniat`}
                                        variant="ghost"
                                        fullWidth
                                    >
                                        Ya tengo cuenta
                                    </BaseButton.Root>
                                </div>
                                <p className="text-[11px] font-mono text-text-tertiary text-center mt-3">
                                    Sin tarjeta de crédito. Sin spam. Cancela cuando quieras.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-[13px] font-mono text-text-secondary leading-relaxed mt-2">
                                    Activa recordatorios por email para el RIF{" "}
                                    <span className="font-bold text-text-primary">{rif}</span>
                                    {" "}({taxpayerType === "especial" ? "Sujeto Pasivo Especial" : "Contribuyente Ordinario"}).
                                    Te avisaremos 3 días antes de cada vencimiento.
                                </p>

                                <div className="mt-5 p-3 rounded-lg bg-surface-2 border border-border-light">
                                    <p className="text-[11px] font-mono text-text-tertiary">
                                        Recibirás un email en{" "}
                                        <span className="font-bold text-text-primary">{user?.email}</span>
                                        {" "}3 días antes de cada obligación fiscal.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 mt-5">
                                    <BaseButton.Root
                                        variant="primary"
                                        fullWidth
                                        onClick={() => void handleSubmit()}
                                        loading={loading}
                                        disabled={loading}
                                    >
                                        Activar recordatorios
                                    </BaseButton.Root>
                                    <BaseButton.Root
                                        variant="ghost"
                                        fullWidth
                                        onClick={() => setOpen(false)}
                                        disabled={loading}
                                    >
                                        Cancelar
                                    </BaseButton.Root>
                                </div>

                                {/* Link to manage existing subscriptions */}
                                <button
                                    type="button"
                                    onClick={() => { setOpen(false); setManageOpen(true); }}
                                    className="mt-3 w-full flex items-center justify-center gap-1.5 text-[11px] font-mono text-text-tertiary hover:text-text-secondary transition-colors duration-150"
                                >
                                    <Settings size={11} />
                                    Ver mis recordatorios activos
                                </button>
                            </>
                        )}
                    </ModalBody>
                </ModalContent>
            </Modal>

            {/* ── Management panel ── */}
            <ReminderManagementPanel
                open={manageOpen}
                onOpenChange={setManageOpen}
            />
        </>
    );
}
