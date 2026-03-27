"use client";

import { useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";

export default function CompanySettingsPage() {
    const { company, update } = useCompany();
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState<string | null>(null);

    const showLogoInPdf = company?.showLogoInPdf ?? false;

    async function handleToggle() {
        if (!company) return;
        setSaving(true);
        setError(null);
        const err = await update(company.id, { showLogoInPdf: !showLogoInPdf });
        if (err) setError(err);
        setSaving(false);
    }

    return (
        <div className="px-6 py-8 max-w-2xl space-y-8">
            <div>
                <h1 className="font-mono text-sm font-bold text-foreground">Empresa</h1>
                <p className="font-mono text-xs text-foreground/40 mt-0.5">Configuración general de la empresa activa.</p>
            </div>

            {/* Reportes PDF */}
            <section className="border border-border-light rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border-light bg-surface-2">
                    <h2 className="font-mono text-xs font-semibold text-foreground/70 uppercase tracking-[0.14em]">
                        Reportes PDF
                    </h2>
                </div>

                <div className="divide-y divide-border-light">
                    {/* Logo toggle */}
                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                        <div className="min-w-0">
                            <p className="font-mono text-xs text-foreground">Incluir logo en reportes</p>
                            <p className="font-mono text-[11px] text-foreground/40 mt-0.5">
                                Muestra el logo de la empresa en los PDFs generados (nómina, vacaciones, etc.)
                            </p>
                            {!company?.logoUrl && (
                                <p className="font-mono text-[11px] text-foreground/30 mt-1">
                                    La empresa no tiene logo configurado.
                                </p>
                            )}
                        </div>
                        <button
                            role="switch"
                            aria-checked={showLogoInPdf}
                            onClick={handleToggle}
                            disabled={saving || !company}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0
                                ${showLogoInPdf ? "bg-primary-500" : "bg-foreground/20"}
                                disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform
                                ${showLogoInPdf ? "translate-x-[19px]" : "translate-x-[2px]"}`} />
                        </button>
                    </div>
                </div>
            </section>

            {error && (
                <p className="font-mono text-xs text-red-500">{error}</p>
            )}
        </div>
    );
}
