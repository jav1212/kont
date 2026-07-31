"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePayrollSettings } from "@/src/modules/payroll/frontend/hooks/use-payroll-settings";
import { useActiveTenantContext } from "@/src/modules/memberships/frontend/context/active-tenant-context";
import type { PayrollBonusRowDef, PayrollSettings } from "@/src/modules/payroll/backend/domain/payroll-settings";

const inputClass = "w-full h-9 rounded-lg border border-border-default bg-surface-1 px-3 font-mono text-[13px] text-foreground outline-none focus:border-primary-500";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return <section className="rounded-xl border border-border-light bg-surface-1 p-5 sm:p-6 space-y-5"><div><h2 className="font-mono text-[12px] uppercase tracking-[0.16em] font-semibold text-foreground">{title}</h2></div>{children}</section>;
}

export default function PayrollSettingsPage() {
    const { company, companyId } = useCompany();
    const { activeTenantRole } = useActiveTenantContext();
    const canEdit = activeTenantRole !== "contable";
    const { settings, loading, save } = usePayrollSettings(companyId);
    const [draft, setDraft] = useState<PayrollSettings>(settings);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => { setDraft(settings); }, [settings]);

    const setBonus = (index: number, patch: Partial<PayrollBonusRowDef>) => {
        setDraft((current) => ({ ...current, bonusRowDefs: current.bonusRowDefs.map((row, i) => i === index ? { ...row, ...patch } : row) }));
    };

    const removeBonus = (index: number) => {
        setDraft((current) => ({ ...current, bonusRowDefs: current.bonusRowDefs.filter((_, i) => i !== index) }));
    };

    const addBonus = () => {
        setDraft((current) => ({ ...current, bonusRowDefs: [...current.bonusRowDefs, { label: "", amount: "0", currency: "VES" }] }));
    };

    const toggleMode = (mode: "diario" | "hora") => {
        setDraft((current) => {
            const enabled = current.enabledPaymentModes.includes(mode);
            if (enabled && current.enabledPaymentModes.length === 1) return current;
            return { ...current, enabledPaymentModes: enabled ? current.enabledPaymentModes.filter((item) => item !== mode) : [...current.enabledPaymentModes, mode] };
        });
    };

    const toggleBenefit = (key: "cestaTicketEnabled" | "bonoGuerraEnabled") => setDraft((current) => ({ ...current, [key]: !current[key] }));

    const handleSave = async () => {
        setSaving(true); setMessage(null);
        const error = await save(draft);
        setSaving(false);
        setMessage(error ?? "Configuraci\u00f3n guardada");
        if (error) window.setTimeout(() => setMessage(null), 3500);
    };

    return <div className="min-h-full bg-surface-0">
        <PageHeader title={"Configuraci" + String.fromCharCode(243) + "n de n" + String.fromCharCode(243) + "mina"} subtitle={company ? company.name : "Selecciona una empresa"}>
            <BaseButton.Root variant="primary" size="sm" onClick={handleSave} loading={saving} isDisabled={!companyId || loading || !canEdit} leftIcon={!saving ? <Save size={14} /> : undefined}>Guardar cambios</BaseButton.Root>
        </PageHeader>
        <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
            {!canEdit && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-mono text-[12px] text-amber-700">Vista de solo lectura para contables invitados. Los cambios de configuracion los realiza el administrador.</div>}
            {message && <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 px-4 py-3 font-mono text-[12px] text-primary-500">{message}</div>}
            {!companyId ? <div className="rounded-xl border border-dashed border-border-light p-10 text-center font-mono text-[12px] text-[var(--text-tertiary)]">Selecciona una empresa para configurar su nomina.</div> : <>
                <Section title="Modalidades disponibles">
                    <p className="font-sans text-[13px] text-[var(--text-secondary)]">Estas modalidades podr?n asignarse individualmente a cada empleado.</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        {(["diario", "hora"] as const).map((mode) => <label key={mode} className="flex items-center gap-3 rounded-lg border border-border-light px-4 py-3 cursor-pointer hover:bg-surface-2"><input type="checkbox" checked={draft.enabledPaymentModes.includes(mode)} onChange={() => toggleMode(mode)} disabled={!canEdit} className="h-4 w-4 accent-[var(--primary)]" /><span className="font-mono text-[13px]">{mode === "diario" ? "Pago por d\u00eda" : "Pago por hora"}</span></label>)}
                    </div>
                </Section>
                <Section title="Beneficios disponibles">
                    <p className="font-sans text-[13px] text-[var(--text-secondary)]">Activa solo los conceptos que esta empresa utiliza. Si estan inactivos, no se incorporan al calculo.</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-border-light px-4 py-3 cursor-pointer hover:bg-surface-2"><span className="font-mono text-[13px]">Cesta Ticket</span><input type="checkbox" checked={draft.cestaTicketEnabled} onChange={() => toggleBenefit("cestaTicketEnabled")} disabled={!canEdit} className="h-4 w-4 accent-[var(--primary)]" /></label>
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-border-light px-4 py-3 cursor-pointer hover:bg-surface-2"><span className="font-mono text-[13px]">Bono Socioeconomico</span><input type="checkbox" checked={draft.bonoGuerraEnabled} onChange={() => toggleBenefit("bonoGuerraEnabled")} disabled={!canEdit} className="h-4 w-4 accent-[var(--primary)]" /></label>
                    </div>
                </Section>
                <Section title="Conceptos de bonos">
                    <p className="font-sans text-[13px] text-[var(--text-secondary)]">Personaliza el nombre y monto que aparecer?n en la calculadora de esta empresa.</p>
                    <div className="space-y-3">{draft.bonusRowDefs.map((bonus, index) => <div key={index} className="grid grid-cols-[auto_1fr_120px_90px_auto] gap-2 items-end"><label className="flex items-center justify-center h-9"><input type="checkbox" checked={bonus.active !== false} onChange={(e) => setBonus(index, { active: e.target.checked })} disabled={!canEdit} aria-label="Activar concepto" className="h-4 w-4 accent-[var(--primary)]" /></label><label className="min-w-0"><span className="block mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Nombre</span><input className={inputClass} value={bonus.label} onChange={(e) => setBonus(index, { label: e.target.value })} disabled={!canEdit} placeholder="Ej. Ayuda Alimentaria" /></label><label><span className="block mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Monto</span><input className={inputClass + " text-right"} type="number" min={0} step={0.01} value={bonus.amount} onChange={(e) => setBonus(index, { amount: e.target.value })} disabled={!canEdit} /></label><label><span className="block mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Moneda</span><select className={inputClass} value={bonus.currency ?? "USD"} onChange={(e) => setBonus(index, { currency: e.target.value as "USD" | "VES" })} disabled={!canEdit}><option value="VES">VES</option><option value="USD">USD</option></select></label><button type="button" onClick={() => removeBonus(index)} disabled={!canEdit} className="h-9 px-2 rounded-lg border border-border-light text-[var(--text-tertiary)] hover:text-red-500 hover:border-red-500/40" aria-label="Eliminar concepto"><Trash2 size={15} /></button></div>)}</div>
                    <BaseButton.Root variant="secondary" size="sm" onClick={addBonus} isDisabled={!canEdit} leftIcon={<Plus size={14} />}>Agregar concepto</BaseButton.Root>
                </Section>
            </>}
        </main>
    </div>;
}
