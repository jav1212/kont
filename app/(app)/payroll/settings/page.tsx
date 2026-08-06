"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePayrollSettings } from "@/src/modules/payroll/frontend/hooks/use-payroll-settings";
import type { PayrollBonusRowDef, PayrollSettings } from "@/src/modules/payroll/backend/domain/payroll-settings";
import { PAYROLL_REFERENCE_CURRENCIES } from "@/src/modules/payroll/shared/reference-currency";

const inputClass = "h-10 w-full rounded-lg border border-border-default bg-surface-1 px-3 font-sans text-[13px] text-foreground outline-none transition-[border,box-shadow] placeholder:text-[var(--text-tertiary)] focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return <section className="scroll-mt-24 space-y-6 rounded-xl border border-border-light bg-surface-1 shadow-[var(--shadow-sm)]" aria-labelledby={`section-${title}`}><div className="border-b border-border-light px-5 py-5 sm:px-7"><h2 id={`section-${title}`} className="font-sans text-[18px] font-semibold tracking-tight text-foreground">{title}</h2></div><div className="space-y-6 px-5 pb-6 pt-5 sm:px-7 sm:pb-7">{children}</div></section>;
}

export default function PayrollSettingsPage() {
    const { company, companyId } = useCompany();
    const canEdit = true;
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
        <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
            <div className="space-y-1">
                <h1 className="font-sans text-2xl font-semibold tracking-tight text-foreground">Configuración de nómina</h1>
                <p className="font-sans text-[13px] text-[var(--text-secondary)]">Administra las modalidades, beneficios y conceptos disponibles para {company?.name ?? "esta empresa"}.</p>
            </div>
            <nav aria-label="Secciones de configuración" className="sticky top-14 z-10 -mx-4 overflow-x-auto border-y border-border-light bg-background/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                <div className="flex min-w-max items-center gap-1 py-2">
                    {[['modalidades', 'Modalidades'], ['beneficios', 'Beneficios'], ['bonos', 'Conceptos de bonos']].map(([id, label], index) => <a key={id} href={`#section-${index === 0 ? 'Modalidades disponibles' : index === 1 ? 'Beneficios disponibles' : 'Conceptos de bonos'}`} className="rounded-md px-3 py-1.5 font-sans text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-surface-2 hover:text-foreground">{label}</a>)}
                </div>
            </nav>
            {message && <div className="rounded-lg border border-primary-500/30 bg-primary-500/10 px-4 py-3 font-mono text-[12px] text-primary-500">{message}</div>}
            {!companyId ? <div className="rounded-xl border border-dashed border-border-light p-10 text-center font-mono text-[12px] text-[var(--text-tertiary)]">Selecciona una empresa para configurar su nomina.</div> : <>
                <Section title="Modalidades disponibles">
                    <p className="font-sans text-[13px] text-[var(--text-secondary)]">Estas modalidades podran asignarse individualmente a cada empleado.</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {(["diario", "hora"] as const).map((mode) => <label key={mode} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-border-light px-4 transition-colors hover:border-border-medium hover:bg-surface-2"><input type="checkbox" checked={draft.enabledPaymentModes.includes(mode)} onChange={() => toggleMode(mode)} disabled={!canEdit} className="h-4 w-4 accent-[var(--primary-500)]" /><span className="font-sans text-[14px] font-medium">{mode === "diario" ? "Pago por d\u00eda" : "Pago por hora"}</span></label>)}
                    </div>
                </Section>
                <Section title="Beneficios disponibles">
                    <p className="font-sans text-[13px] text-[var(--text-secondary)]">Activa solo los conceptos que esta empresa utiliza. Si estan inactivos, no se incorporan al calculo.</p>
                    <div className="grid sm:grid-cols-2 gap-3">
                        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border-light px-4 transition-colors hover:border-border-medium hover:bg-surface-2"><span className="font-sans text-[14px] font-medium">Cesta Ticket</span><input type="checkbox" checked={draft.cestaTicketEnabled} onChange={() => toggleBenefit("cestaTicketEnabled")} disabled={!canEdit} className="h-4 w-4 accent-[var(--primary-500)]" /></label>
                        <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-border-light px-4 transition-colors hover:border-border-medium hover:bg-surface-2"><span className="font-sans text-[14px] font-medium">Bono Socioeconómico</span><input type="checkbox" checked={draft.bonoGuerraEnabled} onChange={() => toggleBenefit("bonoGuerraEnabled")} disabled={!canEdit} className="h-4 w-4 accent-[var(--primary-500)]" /></label>
                    </div>
                </Section>
                <Section title="Conceptos de bonos">
                    <p className="font-sans text-[13px] text-[var(--text-secondary)]">Personaliza el nombre y monto que apareceran en la calculadora de esta empresa.</p>
                    <div className="space-y-3">{draft.bonusRowDefs.map((bonus, index) => <div key={index} className="grid grid-cols-1 items-end gap-3 rounded-xl border border-border-light bg-surface-2/50 p-3 sm:grid-cols-[auto_minmax(0,1fr)_120px_100px_auto] sm:border-0 sm:bg-transparent sm:p-0"><label className="flex h-10 items-center justify-start sm:justify-center"><input type="checkbox" checked={bonus.active !== false} onChange={(e) => setBonus(index, { active: e.target.checked })} disabled={!canEdit} aria-label="Activar concepto" className="h-4 w-4 accent-[var(--primary-500)]" /></label><label className="min-w-0"><span className="mb-1 block font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Nombre</span><input className={inputClass} value={bonus.label} onChange={(e) => setBonus(index, { label: e.target.value })} disabled={!canEdit} placeholder="Ej. Ayuda Alimentaria" /></label><label><span className="mb-1 block font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Monto</span><input className={inputClass + " text-right"} type="number" min={0} step={0.01} value={bonus.amount} onChange={(e) => setBonus(index, { amount: e.target.value })} disabled={!canEdit} /></label><label><span className="mb-1 block font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Moneda</span><select className={inputClass} value={bonus.currency ?? "USD"} onChange={(e) => setBonus(index, { currency: e.target.value as PayrollBonusRowDef["currency"] })} disabled={!canEdit}>{<option value="VES">VES</option>}{PAYROLL_REFERENCE_CURRENCIES.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}</select></label><button type="button" onClick={() => removeBonus(index)} disabled={!canEdit} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-light text-[var(--text-tertiary)] transition-colors hover:border-red-500/40 hover:bg-red-50 hover:text-red-500" aria-label="Eliminar concepto"><Trash2 size={15} /></button></div>)}</div>
                    <BaseButton.Root variant="secondary" size="sm" onClick={addBonus} isDisabled={!canEdit} leftIcon={<Plus size={14} />}>Agregar concepto</BaseButton.Root>
                </Section>
            </>}
        </main>
    </div>;
}
