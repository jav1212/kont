"use client";

// CompanyEditModal — formulario de edición de empresa en modal centrado.
// Reemplaza la edición inline dentro de la fila de la tabla, que apretaba
// 6 inputs en una fila y rompía la jerarquía visual. Aquí cada campo tiene
// su propio espacio y agrupamos por contexto: Identidad, Logo, Contacto,
// Operación.

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import {
    Building2, Camera, Check, X, Loader2, Trash2, Mail, Phone, MapPin, Tags, BadgeCheck,
} from "lucide-react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { InlineSelect } from "@/src/shared/frontend/components/inline-select";
import type { InlineSelectOption } from "@/src/shared/frontend/components/inline-select";
import type {
    Company, BusinessSector, TaxpayerType, CompanyUpdateData,
} from "@/src/modules/companies/frontend/hooks/use-companies";
import {
    SECTOR_LABELS, BUSINESS_SECTORS, TAXPAYER_TYPES, TAXPAYER_TYPE_LABELS,
} from "@/src/modules/companies/backend/domain/company";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { notify } from "@/src/shared/frontend/notify";

// ── Options ──────────────────────────────────────────────────────────────────

const TAXPAYER_OPTIONS: InlineSelectOption<TaxpayerType>[] = TAXPAYER_TYPES.map((t) => ({
    value: t,
    label: TAXPAYER_TYPE_LABELS[t],
}));

const SECTOR_OPTIONS: InlineSelectOption<BusinessSector>[] = BUSINESS_SECTORS.map((s) => ({
    value: s,
    label: SECTOR_LABELS[s],
}));

// ── Tokens ───────────────────────────────────────────────────────────────────

const SECTION_LABEL =
    "font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-semibold";

const FIELD_LABEL =
    "font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
    company:    Company | null;
    userId:     string | null;
    onClose:    () => void;
    onSave:     (id: string, patch: CompanyUpdateData) => Promise<string | null>;
    onApplySector: (id: string, sector: BusinessSector) => Promise<string | null>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CompanyEditModal({ company, userId, onClose, onSave, onApplySector }: Props) {
    const open = company !== null;

    return (
        <AnimatePresence>
            {open && company && (
                <CompanyEditModalBody
                    key={company.id}
                    company={company}
                    userId={userId}
                    onClose={onClose}
                    onSave={onSave}
                    onApplySector={onApplySector}
                />
            )}
        </AnimatePresence>
    );
}

// ── Inner body (re-mounts on open so state initializes from current company) ──

function CompanyEditModalBody({ company, userId, onClose, onSave, onApplySector }: Required<Omit<Props, "company">> & { company: Company }) {
    // Form state — initialized from the company on mount
    const [name, setName]             = useState(company.name);
    const [phone, setPhone]           = useState(company.phone ?? "");
    const [address, setAddress]       = useState(company.address ?? "");
    const [contactEmail, setContactEmail] = useState(company.contactEmail ?? "");
    const [logoUrl, setLogoUrl]       = useState<string | undefined>(company.logoUrl);
    const [sector, setSector]         = useState<BusinessSector | undefined>(company.sector);
    const [taxpayerType, setTaxpayerType] = useState<TaxpayerType>(company.taxpayerType ?? "ordinario");

    const [logoUploading, setLogoUploading] = useState(false);
    const [logoUploadOk, setLogoUploadOk]   = useState(false);
    const [saving, setSaving]               = useState(false);

    const logoInputRef = useRef<HTMLInputElement>(null);

    // Esc to close, Cmd/Ctrl+Enter to save
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.preventDefault();
                if (!saving && !logoUploading) onClose();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleSave();
            }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [saving, logoUploading]);

    async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !userId) return;
        const MAX = 2 * 1024 * 1024;
        if (file.size > MAX) {
            notify.error("El logo debe ser menor a 2 MB.");
            if (logoInputRef.current) logoInputRef.current.value = "";
            return;
        }
        setLogoUploading(true);
        setLogoUploadOk(false);
        const ext = file.name.split(".").pop();
        const path = `${userId}/${company.id}/logo.${ext}`;
        const { error } = await getSupabaseBrowser().storage
            .from("logos")
            .upload(path, file, { upsert: true });
        if (error) {
            notify.error("No se pudo subir el logo. Verifica el archivo e intenta de nuevo.");
            setLogoUploading(false);
            if (logoInputRef.current) logoInputRef.current.value = "";
            return;
        }
        const { data } = getSupabaseBrowser().storage.from("logos").getPublicUrl(path);
        setLogoUrl(data.publicUrl);
        setLogoUploading(false);
        setLogoUploadOk(true);
        setTimeout(() => setLogoUploadOk(false), 1800);
        if (logoInputRef.current) logoInputRef.current.value = "";
    }

    function handleRemoveLogo() {
        setLogoUrl(undefined);
    }

    async function handleSave() {
        if (saving || logoUploading) return;
        if (!name.trim()) {
            notify.error("El nombre es obligatorio.");
            return;
        }
        setSaving(true);
        const sectorChanged = sector !== company.sector;
        const err = await onSave(company.id, {
            name:         name.trim(),
            phone:        phone.trim() || undefined,
            address:      address.trim() || undefined,
            contactEmail: contactEmail.trim() || undefined,
            logoUrl,
            sector,
            taxpayerType,
        });
        if (err) {
            setSaving(false);
            notify.error(err);
            return;
        }
        if (sectorChanged && sector) {
            const sErr = await onApplySector(company.id, sector);
            if (sErr) { setSaving(false); notify.error(sErr); return; }
        }
        setSaving(false);
        notify.success("Empresa actualizada.");
        onClose();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => !saving && !logoUploading && onClose()}
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            />
            <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="company-edit-title"
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
                className="relative w-full max-w-xl bg-surface-1 border border-border-light rounded-2xl shadow-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-border-light bg-surface-2/40">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-primary-500/20 bg-primary-500/[0.06]">
                            {logoUrl ? (
                                <Image src={logoUrl} alt="" fill unoptimized sizes="40px" className="object-cover" />
                            ) : (
                                <Building2 className="text-primary-500" size={18} strokeWidth={1.6} />
                            )}
                        </div>
                        <div className="min-w-0">
                            <h2 id="company-edit-title" className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                                Editar empresa
                            </h2>
                            <p className="font-mono text-[11px] text-[var(--text-tertiary)] tabular-nums truncate">
                                {company.id}
                            </p>
                        </div>
                    </div>
                    <BaseButton.Icon variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
                        <X size={14} />
                    </BaseButton.Icon>
                </div>

                {/* ── Body ────────────────────────────────────────────────── */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
                    {/* Identidad */}
                    <section className="space-y-3.5">
                        <div className="flex items-center gap-2">
                            <BadgeCheck size={12} className="text-primary-500" strokeWidth={2} />
                            <h3 className={SECTION_LABEL}>Identidad</h3>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-1">
                                <label className={FIELD_LABEL}>RIF</label>
                                <div className="h-10 px-3 rounded-lg border border-border-light bg-surface-2 flex items-center font-mono text-[13px] text-[var(--text-secondary)] tabular-nums">
                                    {company.id}
                                </div>
                            </div>
                            <div className="col-span-2">
                                <label className={FIELD_LABEL}>Razón social</label>
                                <BaseInput.Field
                                    autoFocus
                                    className="w-full"
                                    value={name}
                                    onValueChange={setName}
                                    placeholder="Nombre legal de la empresa"
                                    onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={FIELD_LABEL}>Tipo de contribuyente</label>
                            <div className="inline-flex rounded-lg border border-border-light bg-surface-1 p-0.5">
                                {TAXPAYER_OPTIONS.map((opt) => {
                                    const active = taxpayerType === opt.value;
                                    return (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => setTaxpayerType(opt.value)}
                                            className={[
                                                "h-8 px-3 rounded-md font-mono text-[11px] uppercase tracking-[0.10em] transition-colors",
                                                active
                                                    ? "bg-primary-500/10 text-primary-500 font-bold"
                                                    : "text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2",
                                            ].join(" ")}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-1.5 font-sans text-[12px] text-[var(--text-tertiary)] leading-snug">
                                Los Sujetos Pasivos Especiales (SPE) tienen calendarios y obligaciones distintas según SENIAT.
                            </p>
                        </div>
                    </section>

                    {/* Logo */}
                    <section className="space-y-3.5">
                        <div className="flex items-center gap-2">
                            <Camera size={12} className="text-primary-500" strokeWidth={2} />
                            <h3 className={SECTION_LABEL}>Logo</h3>
                        </div>

                        <div className="flex items-center gap-4">
                            <button
                                type="button"
                                onClick={() => !logoUploading && logoInputRef.current?.click()}
                                disabled={logoUploading}
                                className={[
                                    "relative w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center shrink-0",
                                    "border-2 border-dashed transition-all duration-200",
                                    logoUploadOk
                                        ? "border-[var(--badge-success-border)] bg-[var(--badge-success-bg)]/40"
                                        : logoUrl
                                            ? "border-border-light hover:border-primary-500/40"
                                            : "border-border-medium hover:border-primary-500/50 bg-primary-500/[0.04] hover:bg-primary-500/[0.08]",
                                ].join(" ")}
                                aria-label="Cambiar logo"
                            >
                                {logoUrl ? (
                                    <Image src={logoUrl} alt="" fill unoptimized sizes="80px" className={["object-cover", logoUploading ? "opacity-30" : ""].join(" ")} />
                                ) : (
                                    <div className="flex flex-col items-center gap-1 text-primary-500">
                                        <Camera size={18} strokeWidth={1.6} />
                                        <span className="font-mono text-[9px] uppercase tracking-[0.10em]">Subir</span>
                                    </div>
                                )}
                                {logoUploading && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                                        <Loader2 className="animate-spin text-primary-500" size={20} />
                                    </div>
                                )}
                                {logoUploadOk && !logoUploading && (
                                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[var(--badge-success-bg)] border border-[var(--badge-success-border)] flex items-center justify-center">
                                        <Check size={12} className="text-[var(--text-success)]" />
                                    </div>
                                )}
                            </button>

                            <div className="flex-1 min-w-0">
                                <p className="font-sans text-[13px] text-foreground leading-snug">
                                    {logoUrl ? "Logo cargado" : "Subir un logo"}
                                </p>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)] leading-snug mb-2">
                                    PNG, JPG o WEBP, hasta 2 MB. Aparecerá en facturas y reportes.
                                </p>
                                <div className="flex items-center gap-2">
                                    <BaseButton.Root
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => logoInputRef.current?.click()}
                                        isDisabled={logoUploading}
                                        leftIcon={<Camera size={12} />}
                                    >
                                        {logoUrl ? "Cambiar" : "Subir logo"}
                                    </BaseButton.Root>
                                    {logoUrl && (
                                        <BaseButton.Root
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleRemoveLogo}
                                            isDisabled={logoUploading}
                                            leftIcon={<Trash2 size={12} />}
                                            className="text-[var(--text-tertiary)] hover:text-[var(--text-error)]"
                                        >
                                            Eliminar
                                        </BaseButton.Root>
                                    )}
                                </div>
                            </div>
                            <input
                                ref={logoInputRef}
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={handleLogoUpload}
                            />
                        </div>
                    </section>

                    {/* Contacto */}
                    <section className="space-y-3.5">
                        <div className="flex items-center gap-2">
                            <Phone size={12} className="text-primary-500" strokeWidth={2} />
                            <h3 className={SECTION_LABEL}>Contacto</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={FIELD_LABEL}>
                                    <span className="inline-flex items-center gap-1">
                                        <Phone size={9} strokeWidth={2} /> Teléfono
                                    </span>
                                </label>
                                <BaseInput.Field
                                    className="w-full"
                                    value={phone}
                                    onValueChange={setPhone}
                                    placeholder="0414-1234567"
                                    type="tel"
                                />
                            </div>
                            <div>
                                <label className={FIELD_LABEL}>
                                    <span className="inline-flex items-center gap-1">
                                        <Mail size={9} strokeWidth={2} /> Correo
                                    </span>
                                </label>
                                <BaseInput.Field
                                    className="w-full"
                                    value={contactEmail}
                                    onValueChange={setContactEmail}
                                    placeholder="contacto@empresa.com"
                                    type="email"
                                />
                            </div>
                        </div>

                        <div>
                            <label className={FIELD_LABEL}>
                                <span className="inline-flex items-center gap-1">
                                    <MapPin size={9} strokeWidth={2} /> Dirección fiscal
                                </span>
                            </label>
                            <BaseInput.Field
                                className="w-full"
                                value={address}
                                onValueChange={setAddress}
                                placeholder="Av. Principal, Edif. Centro, Piso 3, Caracas"
                            />
                        </div>
                    </section>

                    {/* Operación */}
                    <section className="space-y-3.5">
                        <div className="flex items-center gap-2">
                            <Tags size={12} className="text-primary-500" strokeWidth={2} />
                            <h3 className={SECTION_LABEL}>Operación</h3>
                        </div>

                        <div>
                            <label className={FIELD_LABEL}>Sector</label>
                            <InlineSelect
                                value={sector}
                                onChange={(v) => setSector((v || undefined) as BusinessSector | undefined)}
                                options={SECTOR_OPTIONS}
                                ariaLabel="Sector de la empresa"
                                size="md"
                                clearable
                                clearLabel="Sin sector"
                            />
                            <p className="mt-1.5 font-sans text-[12px] text-[var(--text-tertiary)] leading-snug">
                                Configura plantillas y reportes según el rubro (farmacia, supermercado, ferretería, etc.).
                            </p>
                        </div>
                    </section>
                </div>

                {/* ── Footer ─────────────────────────────────────────────── */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border-light bg-surface-2/40">
                    <span className="hidden sm:inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                        <kbd className="px-1.5 py-0.5 rounded border border-border-light bg-surface-1 text-[10px] tracking-normal">Esc</kbd>
                        cancelar ·
                        <kbd className="px-1.5 py-0.5 rounded border border-border-light bg-surface-1 text-[10px] tracking-normal">⌘↵</kbd>
                        guardar
                    </span>
                    <div className="flex items-center gap-3 ml-auto">
                        <BaseButton.Root
                            variant="secondary"
                            size="sm"
                            onClick={onClose}
                            isDisabled={saving || logoUploading}
                        >
                            Cancelar
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            loading={saving}
                            isDisabled={logoUploading}
                            leftIcon={<Check size={14} strokeWidth={2.2} />}
                        >
                            Guardar cambios
                        </BaseButton.Root>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
