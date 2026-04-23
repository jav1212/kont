"use client";

import { useState } from "react";
import { Download, Image as ImageIcon, FileText, CalendarPlus, Link2, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import type { CalendarEntry, TaxpayerType } from "../data/types";
import { exportAsIcs } from "../utils/ics-exporter";
import { exportAsPng } from "../utils/image-exporter";
import { exportAsPdf } from "../utils/pdf-exporter";

interface ExportActionsProps {
    entries: CalendarEntry[];
    rif: string;
    taxpayerType: TaxpayerType;
    year: number;
    companyName?: string;
    /** In embed mode, only show ICS and Copy link */
    embedMode?: boolean;
}

export function ExportActions({
    entries,
    rif,
    taxpayerType,
    year,
    companyName,
    embedMode = false,
}: ExportActionsProps) {
    const [open, setOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    const displayName = companyName ?? rif;

    async function handlePng() {
        setOpen(false);
        setExporting(true);
        try {
            await exportAsPng(
                "seniat-calendar-exportable",
                `calendario-seniat-${year}-${rif.replace(/[^A-Z0-9]/gi, "")}`,
                { pixelRatio: 2, backgroundColor: "#FFFFFF" }
            );
            toast.success("Imagen descargada");
        } catch {
            toast.error("Error al generar la imagen");
        } finally {
            setExporting(false);
        }
    }

    function handlePdf() {
        setOpen(false);
        try {
            exportAsPdf({ entries, companyName: displayName, rif, taxpayerType, year });
            toast.success("PDF descargado");
        } catch {
            toast.error("Error al generar el PDF");
        }
    }

    function handleIcs() {
        setOpen(false);
        try {
            exportAsIcs(entries, { rif, taxpayerType, companyName, year });
            toast.success("Archivo iCal descargado");
        } catch {
            toast.error("Error al generar el archivo ICS");
        }
    }

    function handleCopyLink() {
        setOpen(false);
        if (typeof window === "undefined") return;
        navigator.clipboard
            .writeText(window.location.href)
            .then(() => toast.success("Enlace copiado"))
            .catch(() => toast.error("No se pudo copiar el enlace"));
    }

    return (
        <div className="relative">
            <BaseButton.Root
                variant="secondary"
                size="sm"
                onClick={() => setOpen((v) => !v)}
                isDisabled={exporting || entries.length === 0}
                leftIcon={<Download size={12} />}
                rightIcon={<ChevronDown size={12} />}
                aria-label="Exportar calendario tributario"
                aria-haspopup="menu"
                aria-expanded={open}
            >
                {exporting ? "Exportando..." : "Exportar"}
            </BaseButton.Root>

            {open && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setOpen(false)}
                    />
                    {/* Dropdown */}
                    <div className="absolute right-0 top-full mt-1.5 z-50 rounded-xl border border-border-light bg-surface-1 shadow-lg p-1 min-w-[180px]">
                        {!embedMode && (
                            <>
                                <button
                                    onClick={handlePng}
                                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-mono text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-surface-2 hover:text-text-primary"
                                >
                                    <ImageIcon size={13} strokeWidth={1.5} aria-hidden="true" />
                                    Imagen (PNG)
                                </button>
                                <button
                                    onClick={handlePdf}
                                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-mono text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-surface-2 hover:text-text-primary"
                                >
                                    <FileText size={13} strokeWidth={1.5} />
                                    PDF Resumen
                                </button>
                                <div className="my-1 border-t border-border-light" />
                            </>
                        )}
                        <button
                            onClick={handleIcs}
                            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-mono text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-surface-2 hover:text-text-primary"
                        >
                            <CalendarPlus size={13} strokeWidth={1.5} />
                            iCal / Google Cal
                        </button>
                        <button
                            onClick={handleCopyLink}
                            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[13px] font-mono text-text-secondary cursor-pointer transition-colors duration-150 hover:bg-surface-2 hover:text-text-primary"
                        >
                            <Link2 size={13} strokeWidth={1.5} />
                            Copiar enlace
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
