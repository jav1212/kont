"use client";

import { useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { notify } from "@/src/shared/frontend/notify";

export default function CompanySettingsPage() {
    const { company, update } = useCompany();
    const [saving, setSaving] = useState(false);

    const showLogoInPdf = company?.showLogoInPdf ?? false;

    async function handleToggle() {
        if (!company) return;
        setSaving(true);
        const err = await update(company.id, { showLogoInPdf: !showLogoInPdf });
        if (err) notify.error(err);
        setSaving(false);
    }

    return (
        <div className="space-y-6">
            <SettingsSection
                title="Reportes PDF"
                subtitle="Personaliza la apariencia de los recibos de nómina, vacaciones, prestaciones y demás documentos generados por el sistema."
                flush
            >
                <div className="divide-y divide-border-light">
                    {/* Logo toggle */}
                    <div className="flex items-center justify-between gap-6 px-6 py-4">
                        <div className="min-w-0">
                            <p className="font-mono text-[13px] text-foreground">Incluir logo en reportes</p>
                            <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-0.5 leading-snug">
                                Muestra el logo de la empresa en los PDFs generados (nómina, vacaciones, prestaciones, etc.).
                            </p>
                            {!company?.logoUrl && (
                                <p className="font-sans text-[12px] text-[var(--text-disabled)] mt-1 italic">
                                    La empresa aún no tiene un logo configurado.
                                </p>
                            )}
                        </div>
                        <button
                            role="switch"
                            aria-checked={showLogoInPdf}
                            aria-label="Incluir logo en reportes"
                            onClick={handleToggle}
                            disabled={saving || !company}
                            className={[
                                "relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
                                showLogoInPdf ? "bg-primary-500" : "bg-[var(--text-disabled)]/40",
                                "disabled:opacity-50 disabled:cursor-not-allowed",
                            ].join(" ")}
                        >
                            <span className={[
                                "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform",
                                showLogoInPdf ? "translate-x-[19px]" : "translate-x-[3px]",
                            ].join(" ")} />
                        </button>
                    </div>
                </div>
            </SettingsSection>
        </div>
    );
}
