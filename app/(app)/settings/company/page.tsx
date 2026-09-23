"use client";

import { useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { OperatingProfile } from "@/src/modules/companies/frontend/hooks/use-companies";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { notify } from "@/src/shared/frontend/notify";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";

export default function CompanySettingsPage() {
    const { company, update } = useCompany();
    const { can } = useOrganizationModuleAccess("/settings/company");
    const { organization } = useOrganization();
    const [saving, setSaving] = useState(false);

    const showLogoInPdf = company?.showLogoInPdf ?? false;
    const operatingProfile = company?.operatingProfile ?? "standard";
    const canManageOperatingProfile = organization?.role === "owner" || organization?.role === "admin";

    async function handleToggle() {
        if (!company || !can("companies.update")) return;
        setSaving(true);
        const err = await update(company.id, { showLogoInPdf: !showLogoInPdf });
        if (err) notify.error(err);
        setSaving(false);
    }

    async function handleOperatingProfileChange(value: OperatingProfile) {
        if (!company || !canManageOperatingProfile || value === operatingProfile) return;
        setSaving(true);
        const err = await update(company.id, { operatingProfile: value });
        if (err) notify.error(err);
        setSaving(false);
    }

    return (
        <div className="space-y-6">
            <SettingsSection
                title="Modo de operación"
                subtitle="Cada empresa conserva su propio modo. Al cambiar de empresa, Kontave ajusta la navegación y el destino inicial."
                flush
            >
                <div className="divide-y divide-border-light">
                    <label className="flex items-start justify-between gap-6 px-6 py-4">
                        <span className="min-w-0">
                            <span className="block font-mono text-[13px] text-foreground">Experiencia de la empresa</span>
                            <span className="mt-0.5 block font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">
                                Kiosco prioriza Vender, Ventas, Compras e Inventario. El acceso sigue dependiendo de los permisos y la suscripción.
                            </span>
                        </span>
                        <select
                            value={operatingProfile}
                            onChange={(event) => void handleOperatingProfileChange(event.target.value as OperatingProfile)}
                            disabled={saving || !company || !canManageOperatingProfile}
                            aria-label="Modo de operación de la empresa"
                            className="shrink-0 rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-[13px] text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="standard">Estándar</option>
                            <option value="kiosk">Kiosco</option>
                        </select>
                    </label>
                </div>
            </SettingsSection>
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
                            disabled={saving || !company || !can("companies.update")}
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
