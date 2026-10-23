"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { OperatingProfile } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { CompanyDateOrder } from "@kontave/companies/domain";
import { useCompanyDateFormat } from "@/src/modules/companies/frontend/components/company-date-format-provider";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { notify } from "@/src/shared/frontend/notify";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { CompanyBranchSelector } from "@/src/modules/companies/frontend/components/company-branch-selector";
import { InvoiceSeriesSettings } from "@/src/modules/iva/frontend/invoice-series-settings";

export default function CompanySettingsPage() {
    const { company, update, reload } = useCompany();
    const { reload: reloadCompanyDateFormat } = useCompanyDateFormat();
    const { can } = useOrganizationModuleAccess("/settings/company");
    const { organization } = useOrganization();
    const [saving, setSaving] = useState(false);
    const [personNature, setPersonNature] = useState<"natural" | "juridical" | null>(null);
    const [companyVersion, setCompanyVersion] = useState<number | null>(null);
    const [secondaryIdentifiers, setSecondaryIdentifiers] = useState<readonly SecondaryIdentifier[]>([]);
    const [jurisdiction, setJurisdiction] = useState("VE");
    const [scheme, setScheme] = useState("");
    const [identifierValue, setIdentifierValue] = useState("");
    const [identifierVersion, setIdentifierVersion] = useState(0);
    const [identifierSlot, setIdentifierSlot] = useState<string | null>(null);
    const [documentNumbering, setDocumentNumbering] = useState<DocumentNumbering | null>(null);
    const [numberingForm, setNumberingForm] = useState({ salesInvoiceNextNumber: "", deliveryNoteNextNumber: "" });
    const [numberingSaving, setNumberingSaving] = useState(false);
    const [dateOrder, setDateOrder] = useState<CompanyDateOrder | "">("");
    const [dateFormatVersion, setDateFormatVersion] = useState(0);
    const [dateFormatReason, setDateFormatReason] = useState("");
    const [dateFormatSaving, setDateFormatSaving] = useState(false);
    const [monetaryPolicy, setMonetaryPolicy] = useState<MonetaryPolicy | null>(null);
    const [policyCurrencies, setPolicyCurrencies] = useState<string[]>(["USD"]);
    const [policyReason, setPolicyReason] = useState("");
    const [policySaving, setPolicySaving] = useState(false);
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const logoInput = useRef<HTMLInputElement>(null);

    const showLogoInPdf = company?.showLogoInPdf ?? false;
    const operatingProfile = company?.operatingProfile ?? "standard";
    const canManageOperatingProfile = organization?.role === "owner" || organization?.role === "admin";
    const canManageDocumentNumbering = can("companies.update");

    useEffect(() => {
        if (!logoFile) { setLogoPreview(null); return; }
        const url = URL.createObjectURL(logoFile);
        setLogoPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [logoFile]);

    useEffect(() => {
        setLogoFile(null);
        if (!company?.id) { setPersonNature(null); setCompanyVersion(null); setSecondaryIdentifiers([]); return; }
        let current = true;
        const loadCompanyTaxData = async () => {
            const [natureResponse, identifiersResponse] = await Promise.all([
                apiFetch(`/api/companies/person-nature?companyId=${encodeURIComponent(company.id)}`),
                apiFetch(`/api/companies/secondary-tax-identifiers?companyId=${encodeURIComponent(company.id)}`),
            ]);
            const [naturePayload, identifiersPayload] = await Promise.all([natureResponse.json(), identifiersResponse.json()]);
            if (!natureResponse.ok || !identifiersResponse.ok) throw new Error(naturePayload.error ?? identifiersPayload.error ?? "No fue posible cargar la identidad fiscal.");
            if (current) {
                setPersonNature(naturePayload.data.personNature);
                setCompanyVersion(naturePayload.data.version);
                setSecondaryIdentifiers(identifiersPayload.data as readonly SecondaryIdentifier[]);
            }
        };
        void loadCompanyTaxData().catch((error: unknown) => notify.error(error instanceof Error ? error.message : "No fue posible cargar la identidad fiscal."));
        return () => { current = false; };
    }, [company?.id]);

    useEffect(() => {
        setDocumentNumbering(null);
        setNumberingForm({ salesInvoiceNextNumber: "", deliveryNoteNextNumber: "" });
        if (!company?.id || !canManageDocumentNumbering) return;
        let current = true;
        void loadDocumentNumbering(company.id, () => current).catch((error: unknown) => {
            if (current) notify.error(error instanceof Error ? error.message : "No fue posible consultar los correlativos.");
        });
        return () => { current = false; };
    }, [company?.id, canManageDocumentNumbering]);

    useEffect(() => {
        setDateOrder(""); setDateFormatVersion(0); setDateFormatReason("");
        if (!company?.id) return;
        let current = true;
        void apiFetch(`/api/companies/date-format?companyId=${encodeURIComponent(company.id)}`)
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.error ?? "No fue posible consultar el formato de fecha.");
                if (current && payload.data) {
                    setDateOrder(payload.data.dateOrder as CompanyDateOrder);
                    setDateFormatVersion(payload.data.version as number);
                }
            })
            .catch((error: unknown) => { if (current) notify.error(error instanceof Error ? error.message : "No fue posible consultar el formato de fecha."); });
        return () => { current = false; };
    }, [company?.id]);

    useEffect(() => {
        setMonetaryPolicy(null); setPolicyCurrencies(["USD"]); setPolicyReason("");
        if (!company?.id) return;
        let current = true;
        void apiFetch(`/api/companies/monetary-policy?companyId=${encodeURIComponent(company.id)}`)
            .then(async (response) => {
                const payload = await response.json().catch(() => null);
                if (!response.ok) throw new Error(payload?.error ?? "No fue posible consultar la política monetaria.");
                if (current) {
                    const policy = payload.data as MonetaryPolicy | null;
                    setMonetaryPolicy(policy);
                    if (policy) setPolicyCurrencies([...policy.referenceCurrencyCodes]);
                }
            })
            .catch((error: unknown) => { if (current) notify.error(error instanceof Error ? error.message : "No fue posible consultar la política monetaria."); });
        return () => { current = false; };
    }, [company?.id]);

    async function saveMonetaryPolicy() {
        if (!company || !can("companies.update") || !policyReason.trim() || policyCurrencies.length === 0) return;
        setPolicySaving(true);
        try {
            const response = await apiFetch("/api/companies/monetary-policy", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: company.id, expectedPolicyVersion: monetaryPolicy?.version ?? 0,
                    idempotencyKey: crypto.randomUUID(), reason: policyReason.trim(), referenceCurrencyCodes: policyCurrencies }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error ?? "No fue posible guardar la política monetaria.");
            setMonetaryPolicy(payload.data as MonetaryPolicy); setPolicyReason("");
            notify.success("Política monetaria empresarial actualizada.");
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible guardar la política monetaria."); }
        finally { setPolicySaving(false); }
    }

    /**
     * Loads the authoritative company counters and their shared company revision.
     * @param companyId - Selected company identifier.
     * @param isCurrent - Guard that prevents an old company response from replacing the active view.
     * @returns Nothing after the screen snapshot is updated.
     * @throws {Error} When the API rejects the read or returns invalid data.
     */
    async function loadDocumentNumbering(companyId: string, isCurrent: () => boolean = () => true) {
        const response = await apiFetch(`/api/companies/document-numbering?companyId=${encodeURIComponent(companyId)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "No fue posible consultar los correlativos.");
        if (!isCurrent()) return;
        const data = payload.data as DocumentNumbering;
        setDocumentNumbering(data);
        setNumberingForm({ salesInvoiceNextNumber: String(data.salesInvoiceNextNumber), deliveryNoteNextNumber: String(data.deliveryNoteNextNumber) });
        setCompanyVersion(data.companyVersion);
    }

    async function saveDocumentNumbering() {
        if (!company || !documentNumbering || !canManageDocumentNumbering) return;
        const invoice = Number(numberingForm.salesInvoiceNextNumber);
        const delivery = Number(numberingForm.deliveryNoteNextNumber);
        if (!Number.isInteger(invoice) || invoice < 1 || invoice > 99_999_999 || !Number.isInteger(delivery) || delivery < 1 || delivery > 99_999_999) {
            notify.error("Cada correlativo debe ser un entero entre 1 y 99.999.999.");
            return;
        }
        const command: { companyId: string; expectedVersion: number; salesInvoiceNextNumber?: number; deliveryNoteNextNumber?: number } = {
            companyId: company.id, expectedVersion: documentNumbering.companyVersion,
        };
        if (invoice !== documentNumbering.salesInvoiceNextNumber) command.salesInvoiceNextNumber = invoice;
        if (delivery !== documentNumbering.deliveryNoteNextNumber) command.deliveryNoteNextNumber = delivery;
        if (command.salesInvoiceNextNumber === undefined && command.deliveryNoteNextNumber === undefined) {
            notify.info("Los correlativos no tienen cambios.");
            return;
        }
        setNumberingSaving(true);
        try {
            const response = await apiFetch("/api/companies/document-numbering", {
                method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
            });
            const payload = await response.json();
            if (!response.ok) throw Object.assign(new Error(payload.error ?? "No fue posible actualizar los correlativos."), { status: response.status });
            const data = payload.data as DocumentNumbering;
            setDocumentNumbering(data);
            setNumberingForm({ salesInvoiceNextNumber: String(data.salesInvoiceNextNumber), deliveryNoteNextNumber: String(data.deliveryNoteNextNumber) });
            setCompanyVersion(data.companyVersion);
            notify.success("Correlativos actualizados.");
        } catch (error) {
            notify.error(error instanceof Error ? error.message : "No fue posible actualizar los correlativos.");
            if (typeof error === "object" && error !== null && "status" in error && error.status === 409) {
                await loadDocumentNumbering(company.id).catch(() => undefined);
            }
        } finally { setNumberingSaving(false); }
    }

    async function saveDateFormat() {
        if (!company || !dateOrder || !dateFormatReason.trim() || !can("companies.update")) return;
        setDateFormatSaving(true);
        try {
            const response = await apiFetch("/api/companies/date-format", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    companyId: company.id, expectedFormatVersion: dateFormatVersion,
                    idempotencyKey: crypto.randomUUID(), reason: dateFormatReason.trim(), dateOrder,
                }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "No fue posible guardar el formato de fecha.");
            setDateOrder(payload.data.dateOrder as CompanyDateOrder);
            setDateFormatVersion(payload.data.version as number);
            setDateFormatReason("");
            await reloadCompanyDateFormat();
            notify.success("Formato de fecha empresarial actualizado.");
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible guardar el formato de fecha."); }
        finally { setDateFormatSaving(false); }
    }

    async function handleToggle() {
        if (!company || !can("companies.update")) return;
        setSaving(true);
        try {
            const err = await update(company.id, { showLogoInPdf: !showLogoInPdf });
            if (err) notify.error(err);
            else await refreshCompanyVersion(company.id);
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible actualizar la empresa."); }
        finally { setSaving(false); }
    }

    async function refreshCompanyVersion(companyId: string) {
        const response = await apiFetch(`/api/companies/logo?companyId=${encodeURIComponent(companyId)}`);
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "No fue posible actualizar la revisión de la empresa.");
        setCompanyVersion(payload.data.version as number);
        setDocumentNumbering((current) => current ? { ...current, companyVersion: payload.data.version as number } : current);
    }

    async function saveLogo() {
        if (!company || companyVersion === null || !logoFile || !can("companies.update")) return;
        setSaving(true);
        try {
            const body = new FormData();
            body.set("companyId", company.id);
            body.set("expectedVersion", String(companyVersion));
            body.set("file", logoFile);
            const response = await apiFetch("/api/companies/logo", { method: "PUT", body });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "No fue posible guardar el logotipo.");
            setCompanyVersion(payload.data.version as number);
            setDocumentNumbering((current) => current ? { ...current, companyVersion: payload.data.version as number } : current);
            setLogoFile(null);
            if (logoInput.current) logoInput.current.value = "";
            await reload();
            notify.success("Logotipo de empresa actualizado.");
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible guardar el logotipo."); }
        finally { setSaving(false); }
    }

    async function removeLogo() {
        if (!company || companyVersion === null || !company.logoUrl || !can("companies.update")) return;
        setSaving(true);
        try {
            const response = await apiFetch("/api/companies/logo", {
                method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: company.id, expectedVersion: companyVersion }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "No fue posible retirar el logotipo.");
            setCompanyVersion(payload.data.version as number);
            setDocumentNumbering((current) => current ? { ...current, companyVersion: payload.data.version as number } : current);
            await reload();
            notify.success("Logotipo de empresa retirado.");
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible retirar el logotipo."); }
        finally { setSaving(false); }
    }

    async function handleOperatingProfileChange(value: OperatingProfile) {
        if (!company || !canManageOperatingProfile || value === operatingProfile) return;
        setSaving(true);
        try {
            const err = await update(company.id, { operatingProfile: value });
            if (err) notify.error(err);
            else await refreshCompanyVersion(company.id);
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible actualizar la empresa."); }
        finally { setSaving(false); }
    }

    async function handlePersonNatureChange(value: "natural" | "juridical") {
        if (!company || companyVersion === null || !can("companies.update") || value === personNature) return;
        setSaving(true);
        try {
            const response = await apiFetch("/api/companies/person-nature", {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: company.id, personNature: value }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "No fue posible guardar la clasificación.");
            setPersonNature(payload.data.personNature); setCompanyVersion(payload.data.version);
            setDocumentNumbering((current) => current ? { ...current, companyVersion: payload.data.version as number } : current);
            notify.success("Naturaleza jurídica actualizada.");
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible guardar la clasificación."); }
        finally { setSaving(false); }
    }

    async function saveSecondaryIdentifier() {
        if (!company || !can("companies.update") || !scheme.trim() || !identifierValue.trim()) return;
        setSaving(true);
        try {
            const response = await apiFetch("/api/companies/secondary-tax-identifiers", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: company.id, jurisdiction, scheme, value: identifierValue, expectedVersion: identifierSlot === `${jurisdiction}:${scheme}` ? identifierVersion : 0 }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "No fue posible guardar el identificador.");
            setSecondaryIdentifiers((current) => [...current.filter((item) => item.id !== payload.data.id && `${item.jurisdiction}:${item.scheme}` !== `${payload.data.jurisdiction}:${payload.data.scheme}`), payload.data]);
            setIdentifierVersion(0); setIdentifierSlot(null); setScheme(""); setIdentifierValue("");
            notify.success("Identificador secundario guardado.");
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible guardar el identificador."); }
        finally { setSaving(false); }
    }

    async function removeSecondaryIdentifier(item: SecondaryIdentifier) {
        if (!company || !can("companies.update")) return;
        setSaving(true);
        try {
            const response = await apiFetch("/api/companies/secondary-tax-identifiers", {
                method: "DELETE", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: company.id, jurisdiction: item.jurisdiction, scheme: item.scheme, expectedVersion: item.version }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "No fue posible retirar el identificador.");
            setSecondaryIdentifiers((current) => current.filter((row) => row.id !== item.id));
            if (scheme === item.scheme && jurisdiction === item.jurisdiction) { setScheme(""); setIdentifierValue(""); setIdentifierVersion(0); setIdentifierSlot(null); }
            notify.success("Identificador retirado.");
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible retirar el identificador."); }
        finally { setSaving(false); }
    }

    function editSecondaryIdentifier(item: SecondaryIdentifier) {
        setJurisdiction(item.jurisdiction); setScheme(item.scheme); setIdentifierValue(item.value); setIdentifierVersion(item.version); setIdentifierSlot(`${item.jurisdiction}:${item.scheme}`);
    }

    return (
        <div className="space-y-6">
            <SettingsSection
                title="Identidad fiscal"
                subtitle="Clasifica la naturaleza de la persona y registra identificadores adicionales sin sustituir el RIF principal. Kontave valida formato básico, no la validez ante una autoridad tributaria."
                flush
            >
                <div className="space-y-5 px-6 py-4">
                    <label className="block max-w-md">
                        <span className="mb-1 block font-mono text-[13px] text-foreground">Naturaleza de la persona</span>
                        <select value={personNature ?? ""} onChange={(event) => { if (event.target.value) void handlePersonNatureChange(event.target.value as "natural" | "juridical"); }} disabled={saving || !company || !can("companies.update")} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-[13px] text-foreground disabled:opacity-50">
                            <option value="">Pendiente de verificar</option>
                            <option value="natural">Persona natural</option>
                            <option value="juridical">Persona jurídica</option>
                        </select>
                        <span className="mt-1 block font-sans text-[11px] text-[var(--text-tertiary)]">No se infiere del RIF ni de la condición de contribuyente ordinario o especial.</span>
                    </label>
                    {secondaryIdentifiers.length > 0 && <div className="divide-y divide-border-light rounded-lg border border-border-light">
                        {secondaryIdentifiers.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                            <span className="min-w-24 font-mono text-[11px] uppercase text-[var(--text-tertiary)]">{item.jurisdiction} · {item.scheme}</span>
                            <span className="flex-1 font-sans text-[13px] text-foreground">{item.value}</span>
                            <button type="button" onClick={() => editSecondaryIdentifier(item)} disabled={saving || !can("companies.update")} className="text-[12px] text-primary-600 disabled:opacity-50">Editar</button>
                            <button type="button" onClick={() => void removeSecondaryIdentifier(item)} disabled={saving || !can("companies.update")} className="text-[12px] text-text-error disabled:opacity-50">Retirar</button>
                        </div>)}
                    </div>}
                    <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
                        <label className="block"><span className="mb-1 block font-mono text-[11px] text-[var(--text-tertiary)]">Jurisdicción</span><input value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value.toUpperCase())} maxLength={2} disabled={saving || !can("companies.update")} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-mono text-[13px] disabled:opacity-50" /></label>
                        <label className="block"><span className="mb-1 block font-mono text-[11px] text-[var(--text-tertiary)]">Esquema</span><input value={scheme} onChange={(event) => setScheme(event.target.value)} maxLength={64} placeholder="ej. foreign_tax_id" disabled={saving || !can("companies.update")} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-mono text-[13px] disabled:opacity-50" /></label>
                        <label className="block sm:col-span-2"><span className="mb-1 block font-mono text-[11px] text-[var(--text-tertiary)]">Identificador</span><input value={identifierValue} onChange={(event) => setIdentifierValue(event.target.value)} maxLength={128} disabled={saving || !can("companies.update")} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-[13px] disabled:opacity-50" /></label>
                        <button type="button" onClick={() => void saveSecondaryIdentifier()} disabled={saving || !company || !can("companies.update") || !scheme.trim() || !identifierValue.trim()} className="rounded-lg bg-primary-600 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white disabled:opacity-50">Guardar identificador</button>
                    </div>
                </div>
            </SettingsSection>
            <SettingsSection
                title="Modo de operación"
                subtitle="Cada empresa conserva su propio modo. Al cambiar de empresa, Kontave ajusta la navegación y el destino inicial."
                flush
            >
                <div className="divide-y divide-border-light">
                    <label className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                        <span className="min-w-0 flex-1">
                            <span className="block font-mono text-[13px] text-foreground">Experiencia de la empresa</span>
                            <span className="mt-0.5 block font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">
                                Kiosco prioriza Vender, Ventas, Compras e Inventario. El acceso sigue dependiendo de los permisos y la suscripción.
                            </span>
                        </span>
                        <span className="w-full shrink-0 sm:w-56">
                            <select
                                value={operatingProfile}
                                onChange={(event) => void handleOperatingProfileChange(event.target.value as OperatingProfile)}
                                disabled={saving || !company || !canManageOperatingProfile}
                                aria-label="Modo de operación de la empresa"
                                className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-[13px] text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <option value="standard">Estándar</option>
                                <option value="kiosk">Kiosco</option>
                            </select>
                        </span>
                    </label>
                </div>
            </SettingsSection>
            {(can("branches.read") || can("branches.create") || can("branches.select")) && <CompanyBranchSelector companyId={company?.id ?? null} canRead={can("branches.read")} canSelect={can("branches.select")} canCreate={can("branches.create")} />}
            <SettingsSection
                title="Formato de fecha"
                subtitle="Define cómo se presentan las fechas civiles de esta empresa en la Web. No cambia fechas guardadas ni marcas de tiempo."
                flush
            >
                <div className="grid gap-4 px-6 py-4 md:grid-cols-3 md:items-end">
                    <label className="block">
                        <span className="mb-1 block font-mono text-[11px] uppercase text-[var(--text-tertiary)]">Orden de fecha</span>
                        <select value={dateOrder} onChange={(event) => setDateOrder(event.target.value as CompanyDateOrder | "")} disabled={dateFormatSaving || !can("companies.update")} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-[13px] text-foreground disabled:opacity-50">
                            <option value="">Sin preferencia guardada (Web usa DD/MM/YYYY)</option>
                            <option value="day_first">Día / mes / año — 29/09/2026</option>
                            <option value="year_first">Año / mes / día — 2026-09-29</option>
                            <option value="month_first">Mes / día / año — 09/29/2026</option>
                        </select>
                    </label>
                    <label className="block md:col-span-1">
                        <span className="mb-1 block font-mono text-[11px] uppercase text-[var(--text-tertiary)]">Motivo del cambio</span>
                        <input value={dateFormatReason} onChange={(event) => setDateFormatReason(event.target.value)} maxLength={500} disabled={dateFormatSaving || !can("companies.update")} placeholder="Describe por qué cambia la presentación" className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-[13px] text-foreground disabled:opacity-50" />
                    </label>
                    <button type="button" onClick={() => void saveDateFormat()} disabled={dateFormatSaving || !can("companies.update") || !dateOrder || !dateFormatReason.trim()} className="rounded-lg bg-primary-600 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white disabled:opacity-50">Guardar formato</button>
                </div>
            </SettingsSection>
            {canManageDocumentNumbering && <SettingsSection
                title="Numeración comercial"
                subtitle="Configura el próximo número de factura de venta y nota de entrega. Cada documento confirmado consume el siguiente correlativo."
                flush
            >
                {!documentNumbering ? <p className="px-6 py-4 font-sans text-[12px] text-[var(--text-tertiary)]">Consultando los correlativos…</p> : <div className="grid gap-4 px-6 py-4 md:grid-cols-3 md:items-end">
                    <label className="block">
                        <span className="mb-1 block font-mono text-[11px] uppercase text-[var(--text-tertiary)]">Próxima factura de venta</span>
                        <input type="number" min={1} max={99_999_999} step={1} inputMode="numeric" value={numberingForm.salesInvoiceNextNumber} onChange={(event) => setNumberingForm((current) => ({ ...current, salesInvoiceNextNumber: event.target.value }))} disabled={!documentNumbering || numberingSaving || !canManageDocumentNumbering} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-mono text-[13px] tabular-nums disabled:opacity-50" />
                    </label>
                    <label className="block">
                        <span className="mb-1 block font-mono text-[11px] uppercase text-[var(--text-tertiary)]">Próxima nota de entrega</span>
                        <input type="number" min={1} max={99_999_999} step={1} inputMode="numeric" value={numberingForm.deliveryNoteNextNumber} onChange={(event) => setNumberingForm((current) => ({ ...current, deliveryNoteNextNumber: event.target.value }))} disabled={!documentNumbering || numberingSaving || !canManageDocumentNumbering} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-mono text-[13px] tabular-nums disabled:opacity-50" />
                    </label>
                    <div className="space-y-2">
                        <p className="font-sans text-[11px] leading-snug text-[var(--text-tertiary)]">Solo puedes avanzar el correlativo. Kontave impide reutilizar números emitidos y mantiene la asignación atómica al confirmar documentos.</p>
                        <button type="button" onClick={() => void saveDocumentNumbering()} disabled={!documentNumbering || numberingSaving || !canManageDocumentNumbering} className="rounded-lg bg-primary-600 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white disabled:opacity-50">Guardar numeración</button>
                    </div>
                </div>}
            </SettingsSection>}
            <InvoiceSeriesSettings />
            <SettingsSection
                title="Logotipo empresarial"
                subtitle="Se usa en la identidad de la empresa y en los reportes que tienen la opción de incluirlo. Se aceptan PNG, JPEG o WebP de hasta 5 MiB."
                flush
            >
                <div className="flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center">
                    <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-light bg-surface-2">
                        {(logoPreview ?? company?.logoUrl) ? <Image src={logoPreview ?? company!.logoUrl!} alt="Vista previa del logotipo empresarial" width={80} height={80} unoptimized className="size-full object-contain" /> : <span className="px-2 text-center font-mono text-[10px] uppercase text-[var(--text-tertiary)]">Sin logo</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-mono text-[13px] text-foreground">Imagen de la empresa</p>
                        <p className="mt-0.5 font-sans text-[12px] text-[var(--text-tertiary)]">La carga reemplaza el logo anterior una vez confirmada. Los archivos heredados o externos se mantienen hasta guardar un reemplazo o retirarlos.</p>
                    </div>
                    <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Seleccionar logotipo empresarial" onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)} />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => logoInput.current?.click()} disabled={saving || !company || !can("companies.update")} className="rounded-lg border border-border-light px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-foreground disabled:opacity-50">Seleccionar imagen</button>
                        {logoFile && <button type="button" onClick={() => void saveLogo()} disabled={saving || companyVersion === null} className="rounded-lg bg-primary-600 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-white disabled:opacity-50">Guardar logo</button>}
                        {company?.logoUrl && !logoFile && <button type="button" onClick={() => void removeLogo()} disabled={saving || !can("companies.update") || companyVersion === null} className="rounded-lg border border-border-light px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-text-error disabled:opacity-50">Retirar logo</button>}
                    </div>
                </div>
            </SettingsSection>
            <SettingsSection
                title="Política monetaria empresarial"
                subtitle="Define VES como moneda operativa y las monedas de referencia habilitadas. Cada cambio conserva su revisión, motivo y evidencia."
                flush
            >
                <div className="space-y-4 px-6 py-4">
                    <div className="rounded-lg border border-border-light bg-surface-2 p-3 text-sm">
                        <p>Moneda operativa: <strong>VES · 2 decimales</strong></p>
                        <p className="mt-1 text-xs text-[var(--text-tertiary)]">Fuente BCV; tasa exacta de la fecha solicitada; redondeo comercial half up.</p>
                        <p className="mt-1 text-xs">{monetaryPolicy ? `Revisión ${monetaryPolicy.version} · ${monetaryPolicy.referenceCurrencyCodes.join(", ")}` : "Sin política configurada"}</p>
                    </div>
                    <fieldset disabled={policySaving || !can("companies.update")}>
                        <legend className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">Monedas de referencia</legend>
                        <div className="flex gap-5 text-sm">
                            {["USD", "EUR"].map((code) => <label key={code} className="flex items-center gap-2">
                                <input type="checkbox" checked={policyCurrencies.includes(code)} onChange={(event) => setPolicyCurrencies((current) => event.target.checked ? [...current, code].sort() : current.filter((value) => value !== code))} />{code}
                            </label>)}
                        </div>
                    </fieldset>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="flex-1 font-mono text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">Motivo del cambio
                            <input value={policyReason} onChange={(event) => setPolicyReason(event.target.value)} maxLength={500} placeholder="Describe el motivo" className="mt-1 w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-sm normal-case tracking-normal text-foreground" />
                        </label>
                        <button type="button" onClick={() => void saveMonetaryPolicy()} disabled={policySaving || !can("companies.update") || !policyReason.trim() || policyCurrencies.length === 0} className="rounded-lg bg-primary-600 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white disabled:opacity-50">{policySaving ? "Guardando…" : "Guardar política"}</button>
                    </div>
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

interface SecondaryIdentifier {
    readonly id: string;
    readonly jurisdiction: string;
    readonly scheme: string;
    readonly value: string;
    readonly version: number;
}

interface DocumentNumbering {
    readonly salesInvoiceNextNumber: number;
    readonly deliveryNoteNextNumber: number;
    readonly companyVersion: number;
}

interface MonetaryPolicy {
    readonly version: number;
    readonly referenceCurrencyCodes: readonly string[];
}
