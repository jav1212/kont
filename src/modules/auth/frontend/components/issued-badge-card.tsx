"use client";

import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { notify } from "@/src/shared/frontend/notify";
import { Code128Barcode } from "@/src/modules/auth/frontend/components/code128-barcode";

interface IssuedBadgeCardProps {
    barcode: string;
    email: string | null;
    onClose: () => void;
}

/**
 * Displays a newly issued access credential in a compact, print-ready card.
 *
 * The barcode value is intentionally rendered only as Code 128 bars so a
 * printed credential omits its human-readable secret text.
 *
 * @param props - The credential holder, scanner barcode, and dismissal action.
 * @returns A printable access card and controls that are excluded from printing.
 */
export function IssuedBadgeCard({ barcode, email, onClose }: IssuedBadgeCardProps) {
    const [downloading, setDownloading] = useState(false);

    async function downloadPdf() {
        setDownloading(true);
        try {
            const { accessBadgeFilename, createAccessBadgePdf } = await import("../access-badge-pdf");
            const document = await createAccessBadgePdf({ barcode, email });
            document.save(accessBadgeFilename(email));
        } catch {
            notify.error("No se pudo generar el PDF del carnet.");
        } finally {
            setDownloading(false);
        }
    }

    return <section className="mx-auto w-full max-w-[34rem]" aria-live="polite">
        <style>{`
            @media print {
                @page { margin: 12mm; }
                html:has(#kont-issued-badge), body:has(#kont-issued-badge) {
                    margin: 0 !important;
                    padding: 0 !important;
                    height: auto !important;
                    min-height: 0 !important;
                    background: white !important;
                    color-scheme: light !important;
                    print-color-adjust: exact;
                }
                body:has(#kont-issued-badge) *:has(#kont-issued-badge) {
                    display: contents !important;
                }
                body:has(#kont-issued-badge) *:not(:has(#kont-issued-badge)):not(#kont-issued-badge):not(#kont-issued-badge *) {
                    display: none !important;
                }
                #kont-issued-badge {
                    box-sizing: border-box;
                    width: 110mm;
                    max-width: 100%;
                    margin: 0 auto;
                    break-inside: avoid;
                    border: 1px solid #d1d5db !important;
                    box-shadow: none !important;
                }
            }
        `}</style>
        <article id="kont-issued-badge" className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm print:rounded-none" aria-label="Carnet de acceso emitido">
            <header className="border-b border-slate-200 bg-white px-6 py-5">
                <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-primary-500">Kontave</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Carnet de acceso</h2>
                <p className="mt-1 break-all text-sm text-slate-600">{email ?? "Usuario de Kontave"}</p>
            </header>
            <div className="px-6 py-7">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center">
                    <Code128Barcode value={barcode} />
                </div>
            </div>
        </article>
        <div className="mt-4 flex flex-wrap gap-2 print:hidden"><BaseButton.Root variant="primary" onClick={() => window.print()} leftIcon={<Printer size={13} />}>Imprimir</BaseButton.Root><BaseButton.Root variant="secondary" isDisabled={downloading} loading={downloading} onClick={() => void downloadPdf()} leftIcon={<Download size={13} />}>Descargar PDF</BaseButton.Root><BaseButton.Root variant="ghost" isDisabled={downloading} onClick={onClose}>Cerrar</BaseButton.Root></div>
    </section>;
}
