"use client";

import Image from "next/image";
import { useState, useRef, useCallback, useMemo } from "react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { Company, BusinessSector, TaxpayerType } from "@/src/modules/companies/frontend/hooks/use-companies";
import { SECTOR_LABELS, BUSINESS_SECTORS, TAXPAYER_TYPES, TAXPAYER_TYPE_LABELS } from "@/src/modules/companies/backend/domain/company";
import { companiesToCsv, downloadCsv, parseCompaniesCsv } from "@/src/modules/companies/frontend/utils/company-csv";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { notify } from "@/src/shared/frontend/notify";
import {
    Building2,
    Download,
    Upload,
    Plus,
    Search,
    Trash2,
    Edit3,
    Check,
    X,
    Camera,
    ClipboardPaste,
    Loader2,
    Tags,
    BadgeCheck,
    AlertCircle,
    Star,
    CircleDot,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { InlineSelect } from "@/src/shared/frontend/components/inline-select";
import type { InlineSelectOption } from "@/src/shared/frontend/components/inline-select";

// ============================================================================
// CONSTANTS
// ============================================================================

const TAXPAYER_OPTIONS: InlineSelectOption<TaxpayerType>[] = TAXPAYER_TYPES.map((t) => ({
    value: t,
    label: TAXPAYER_TYPE_LABELS[t],
}));

const SECTOR_OPTIONS: InlineSelectOption<BusinessSector>[] = BUSINESS_SECTORS.map((s) => ({
    value: s,
    label: SECTOR_LABELS[s],
}));

type FilterId = "todas" | "especial" | "ordinario" | "sin_sector" | "incompletas";

// ============================================================================
// ICONS
// ============================================================================

const Spinner = () => <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={13} />;
const IconSave = () => <Check size={14} />;
const IconCancel = () => <X size={14} />;
const IconEdit = () => <Edit3 size={14} />;
const IconTrash = () => <Trash2 size={14} />;
const IconPlus = () => <Plus size={14} />;
const IconCamera = () => <Camera size={10} />;
const IconImport = () => <Upload size={14} />;
const IconExport = () => <Download size={14} />;
const IconPaste = () => <ClipboardPaste size={14} />;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const TAXPAYER_BADGE_STYLES: Record<TaxpayerType, string> = {
    ordinario: "bg-[var(--badge-info-bg)] border border-[var(--badge-info-border)] text-[var(--text-info)]",
    especial:  "bg-[var(--badge-warning-bg)] border border-[var(--badge-warning-border)] text-[var(--text-warning)]",
};

const TAXPAYER_BADGE_LABELS: Record<TaxpayerType, string> = {
    ordinario: "Ordinario",
    especial:  "Especial",
};

function TaxpayerTypeBadge({ type }: { type: TaxpayerType }) {
    return (
        <span className={[
            "inline-flex items-center px-2 py-0.5 rounded-sm",
            "font-mono text-[11px] uppercase tracking-[0.12em]",
            TAXPAYER_BADGE_STYLES[type],
        ].join(" ")}>
            {TAXPAYER_BADGE_LABELS[type]}
        </span>
    );
}

// ── Stat chip (small KPI card) ─────────────────────────────────────────────────

interface StatChipProps {
    icon: React.ReactNode;
    label: string;
    value: number;
    tone?: "neutral" | "primary" | "warning" | "info" | "error";
    hint?: string;
}

const TONE_TILE: Record<NonNullable<StatChipProps["tone"]>, string> = {
    neutral: "bg-surface-2 border-border-light text-[var(--text-secondary)]",
    primary: "bg-primary-500/10 border-primary-500/20 text-primary-500",
    warning: "bg-[var(--badge-warning-bg)] border-[var(--badge-warning-border)] text-[var(--text-warning)]",
    info:    "bg-[var(--badge-info-bg)] border-[var(--badge-info-border)] text-[var(--text-info)]",
    error:   "bg-[var(--badge-error-bg)] border-[var(--badge-error-border)] text-[var(--text-error)]",
};

function StatChip({ icon, label, value, tone = "neutral", hint }: StatChipProps) {
    return (
        <div className="flex items-center gap-3 p-3.5 bg-surface-1 border border-border-light rounded-xl shadow-sm">
            <div className={["w-9 h-9 rounded-lg border flex items-center justify-center shrink-0", TONE_TILE[tone]].join(" ")}>
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] truncate">
                    {label}
                </div>
                <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="font-mono text-[20px] font-semibold tabular-nums tracking-tight text-foreground leading-none">
                        {value}
                    </span>
                    {hint && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                            {hint}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Filter pill ─────────────────────────────────────────────────────────────────

function FilterPill({
    active,
    onClick,
    children,
    count,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    count?: number;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                "inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border",
                "font-mono text-[11px] uppercase tracking-[0.12em] font-medium",
                "transition-colors duration-150",
                active
                    ? "bg-primary-500/10 border-primary-500/30 text-[var(--text-link)]"
                    : "bg-surface-1 border-border-light text-[var(--text-secondary)] hover:bg-surface-2 hover:border-border-medium",
            ].join(" ")}
        >
            <span>{children}</span>
            {typeof count === "number" && (
                <span className={[
                    "font-mono text-[10px] tabular-nums tracking-normal px-1.5 py-px rounded-sm",
                    active
                        ? "bg-primary-500/15 text-[var(--text-link)]"
                        : "bg-surface-2 text-[var(--text-tertiary)]",
                ].join(" ")}>
                    {count}
                </span>
            )}
        </button>
    );
}

// ============================================================================
// PAGE
// ============================================================================

export default function CompaniesPage() {
    const { companies, loading, save, update, remove, applySector, companyId, selectCompany } = useCompany();
    const { capacity, canAddCompany } = useCapacity();
    const { user } = useAuth();
    const atCompanyLimit = !canAddCompany();

    // ── Edit state ────────────────────────────────────────────────────────
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editAddress, setEditAddress] = useState("");
    const [editContactEmail, setEditContactEmail] = useState("");
    const [editLogoUrl, setEditLogoUrl] = useState<string | undefined>(undefined);
    const [editSector, setEditSector] = useState<BusinessSector | undefined>(undefined);
    const [editTaxpayerType, setEditTaxpayerType] = useState<TaxpayerType>("ordinario");
    const [logoUploading, setLogoUploading] = useState(false);
    const [logoUploadSuccess, setLogoUploadSuccess] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // ── New row state ──────────────────────────────────────────────────────
    const [showNew, setShowNew] = useState(false);
    const [newRif, setNewRif] = useState("");
    const [newName, setNewName] = useState("");
    const [newTaxpayerType, setNewTaxpayerType] = useState<TaxpayerType>("ordinario");
    const [newSaving, setNewSaving] = useState(false);

    // ── Delete confirm state ───────────────────────────────────────────────
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // ── CSV state ──────────────────────────────────────────────────────────
    const [csvLoading, setCsvLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Paste modal state ──────────────────────────────────────────────────
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState("");
    const [pasteErrors, setPasteErrors] = useState<string[]>([]);
    const [pasteCount, setPasteCount] = useState<number | null>(null);
    const [pasteImporting, setPasteImporting] = useState(false);

    // ── Search & filters ───────────────────────────────────────────────────
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<FilterId>("todas");

    // ── Stats ─────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const total = companies.length;
        const especiales = companies.filter((c) => c.taxpayerType === "especial").length;
        const conSector = companies.filter((c) => !!c.sector).length;
        const incompletas = companies.filter(
            (c) => !c.phone || !c.address || !c.sector
        ).length;
        return { total, especiales, conSector, incompletas };
    }, [companies]);

    // ── Filter counts ─────────────────────────────────────────────────────
    const filterCounts = useMemo(() => {
        const especial = companies.filter((c) => c.taxpayerType === "especial").length;
        const ordinario = companies.filter((c) => (c.taxpayerType ?? "ordinario") === "ordinario").length;
        const sinSector = companies.filter((c) => !c.sector).length;
        const incompletas = companies.filter((c) => !c.phone || !c.address || !c.sector).length;
        return { especial, ordinario, sinSector, incompletas };
    }, [companies]);

    // ── Filtered companies ─────────────────────────────────────────────────
    const filtered = useMemo(() => {
        return companies.filter((c) => {
            // Filter pill
            if (filter === "especial"  && c.taxpayerType !== "especial") return false;
            if (filter === "ordinario" && (c.taxpayerType ?? "ordinario") !== "ordinario") return false;
            if (filter === "sin_sector" && !!c.sector) return false;
            if (filter === "incompletas" && c.phone && c.address && c.sector) return false;
            // Search
            if (!search) return true;
            const q = search.toLowerCase();
            return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
        });
    }, [companies, search, filter]);

    // ── Edit actions ───────────────────────────────────────────────────────

    const startEdit = useCallback((company: Company) => {
        setEditingId(company.id);
        setEditName(company.name);
        setEditPhone(company.phone ?? "");
        setEditAddress(company.address ?? "");
        setEditContactEmail(company.contactEmail ?? "");
        setEditLogoUrl(company.logoUrl);
        setEditSector(company.sector);
        setEditTaxpayerType(company.taxpayerType ?? "ordinario");
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditName("");
        setEditPhone("");
        setEditAddress("");
        setEditContactEmail("");
        setEditLogoUrl(undefined);
        setEditSector(undefined);
        setEditTaxpayerType("ordinario");
        setLogoUploadSuccess(false);
    }, []);

    const saveEdit = useCallback(async () => {
        if (!editingId || !editName.trim()) return;
        setEditSaving(true);

        const original = companies.find(c => c.id === editingId);
        const sectorChanged = editSector !== original?.sector;

        const err = await update(editingId, {
            name: editName.trim(),
            phone: editPhone.trim() || undefined,
            address: editAddress.trim() || undefined,
            contactEmail: editContactEmail.trim() || undefined,
            logoUrl: editLogoUrl,
            sector: editSector,
            taxpayerType: editTaxpayerType,
        });

        if (!err && sectorChanged && editSector) {
            const sectorErr = await applySector(editingId, editSector);
            if (sectorErr) { setEditSaving(false); notify.error(sectorErr); return; }
        }

        setEditSaving(false);
        if (err) notify.error(err);
        else     cancelEdit();
    }, [editingId, editName, editPhone, editAddress, editContactEmail, editLogoUrl, editSector, editTaxpayerType, companies, update, applySector, cancelEdit]);

    const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user || !editingId) return;

        const MAX_BYTES = 2 * 1024 * 1024;
        if (file.size > MAX_BYTES) {
            notify.error("El logo debe ser menor a 2 MB.");
            if (logoInputRef.current) logoInputRef.current.value = "";
            return;
        }

        setLogoUploading(true);
        setLogoUploadSuccess(false);
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${editingId}/logo.${ext}`;
        const { error: uploadErr } = await getSupabaseBrowser().storage
            .from("logos")
            .upload(path, file, { upsert: true });
        if (uploadErr) {
            console.error("[logo-upload]", uploadErr);
            notify.error("No se pudo subir el logo. Verifica el archivo e intenta de nuevo.");
            setLogoUploading(false);
            if (logoInputRef.current) logoInputRef.current.value = "";
            return;
        }
        const { data: { publicUrl } } = getSupabaseBrowser().storage.from("logos").getPublicUrl(path);
        setEditLogoUrl(publicUrl);
        setLogoUploading(false);
        setLogoUploadSuccess(true);
        setTimeout(() => setLogoUploadSuccess(false), 1800);
        if (logoInputRef.current) logoInputRef.current.value = "";
    }, [user, editingId]);

    // ── New actions ────────────────────────────────────────────────────────

    const saveNew = useCallback(async () => {
        if (!newRif.trim())  { notify.error("El RIF es obligatorio"); return; }
        if (!newName.trim()) { notify.error("El nombre es obligatorio"); return; }
        setNewSaving(true);
        const err = await save({ id: newRif.trim().toUpperCase(), name: newName.trim(), taxpayerType: newTaxpayerType });
        setNewSaving(false);
        if (err) notify.error(err);
        else     { setShowNew(false); setNewRif(""); setNewName(""); setNewTaxpayerType("ordinario"); }
    }, [newRif, newName, newTaxpayerType, save]);

    const cancelNew = useCallback(() => {
        setShowNew(false);
        setNewRif("");
        setNewName("");
        setNewTaxpayerType("ordinario");
    }, []);

    // ── Delete actions ─────────────────────────────────────────────────────

    const handleDelete = useCallback(async (id: string) => {
        setDeleting(true);
        const err = await remove(id);
        setDeleting(false);
        if (err) notify.error(err);
        else     setConfirmId(null);
    }, [remove]);

    // ── CSV export ─────────────────────────────────────────────────────────

    const handleExport = useCallback(() => {
        if (!filtered.length) return;
        downloadCsv(companiesToCsv(filtered), `empresas_${getTodayIsoDate()}.csv`);
    }, [filtered]);

    // ── CSV import (file) ──────────────────────────────────────────────────

    const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvLoading(true);
        const { companies: parsed, errors } = parseCompaniesCsv(await file.text());
        if (errors.length > 0) {
            notify.error(errors[0]);
            setCsvLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        let firstErr: string | null = null;
        for (const row of parsed) {
            const err = await save({ id: row.rif, name: row.nombre, taxpayerType: row.tipoContribuyente });
            if (err && !firstErr) firstErr = err;
        }
        if (firstErr) notify.error(firstErr);
        setCsvLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [save]);

    // ── Paste modal ────────────────────────────────────────────────────────

    const handlePasteChange = useCallback((text: string) => {
        setPasteText(text);
        if (!text.trim()) { setPasteErrors([]); setPasteCount(null); return; }
        const { companies: parsed, errors } = parseCompaniesCsv(text);
        setPasteErrors(errors);
        setPasteCount(errors.length === 0 ? parsed.length : null);
    }, []);

    const handlePasteImport = useCallback(async () => {
        const { companies: parsed, errors } = parseCompaniesCsv(pasteText);
        if (errors.length > 0) return;
        setPasteImporting(true);
        let firstErr: string | null = null;
        for (const row of parsed) {
            const err = await save({ id: row.rif, name: row.nombre, taxpayerType: row.tipoContribuyente });
            if (err && !firstErr) firstErr = err;
        }
        setPasteImporting(false);
        if (firstErr) { setPasteErrors([firstErr]); return; }
        setPasteOpen(false);
        setPasteText("");
        setPasteErrors([]);
        setPasteCount(null);
    }, [pasteText, save]);

    const closePasteModal = useCallback(() => {
        setPasteOpen(false);
        setPasteText("");
        setPasteErrors([]);
        setPasteCount(null);
    }, []);

    const insertPasteExample = useCallback(() => {
        const example = [
            '"rif","nombre","tipo_contribuyente"',
            '"J-12345678-9","Distribuidora El Sol C.A.","ordinario"',
            '"J-87654321-0","Inversiones Caracas S.A.","especial"',
        ].join("\n");
        handlePasteChange(example);
    }, [handlePasteChange]);

    // ── Helpers ────────────────────────────────────────────────────────────

    const formatDate = (iso?: string) => {
        if (!iso) return "—";
        return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
    };

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="min-h-full bg-surface-2 selection:bg-primary-500/30">
            <PageHeader
                title="Empresas"
                subtitle={capacity?.companies.max !== null && capacity
                    ? `${capacity.companies.used} / ${capacity.companies.max} empresa${capacity.companies.max !== 1 ? "s" : ""}`
                    : `${companies.length} empresa${companies.length !== 1 ? "s" : ""}`
                }
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={handleExport}
                        isDisabled={filtered.length === 0}
                        leftIcon={<IconExport />}
                    >
                        Exportar
                    </BaseButton.Root>

                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        isDisabled={csvLoading || atCompanyLimit}
                        title={atCompanyLimit ? "Límite de empresas alcanzado" : undefined}
                        leftIcon={csvLoading ? <Spinner /> : <IconImport />}
                    >
                        Importar
                    </BaseButton.Root>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        className="sr-only"
                        onChange={handleImportFile}
                        disabled={atCompanyLimit}
                    />

                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={() => setPasteOpen(true)}
                        isDisabled={atCompanyLimit}
                        title={atCompanyLimit ? "Límite de empresas alcanzado" : undefined}
                        leftIcon={<IconPaste />}
                    >
                        Pegar
                    </BaseButton.Root>

                    <BaseButton.Root
                        variant="primary"
                        size="sm"
                        onClick={() => { setShowNew(true); setNewRif(""); setNewName(""); }}
                        isDisabled={showNew || atCompanyLimit}
                        title={atCompanyLimit ? "Límite de empresas alcanzado" : undefined}
                        leftIcon={<IconPlus />}
                    >
                        Nueva empresa
                    </BaseButton.Root>
                </div>
            </PageHeader>

            <div className="px-8 py-6 space-y-6">

                {/* Stats strip — appears once there is at least one company */}
                {!loading && companies.length > 0 && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatChip
                            icon={<Building2 size={16} strokeWidth={1.8} />}
                            label="Total registradas"
                            value={stats.total}
                            tone="primary"
                            hint={capacity?.companies.max !== null && capacity ? `de ${capacity.companies.max}` : undefined}
                        />
                        <StatChip
                            icon={<BadgeCheck size={16} strokeWidth={1.8} />}
                            label="Sujeto pasivo especial"
                            value={stats.especiales}
                            tone="warning"
                            hint={stats.total > 0 ? `${Math.round((stats.especiales / stats.total) * 100)} %` : undefined}
                        />
                        <StatChip
                            icon={<Tags size={16} strokeWidth={1.8} />}
                            label="Con sector asignado"
                            value={stats.conSector}
                            tone="info"
                        />
                        <StatChip
                            icon={<AlertCircle size={16} strokeWidth={1.8} />}
                            label="Perfiles incompletos"
                            value={stats.incompletas}
                            tone={stats.incompletas > 0 ? "error" : "neutral"}
                            hint="teléfono · dirección · sector"
                        />
                    </div>
                )}

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center h-32 gap-2 border border-border-light rounded-xl bg-surface-1">
                        <Spinner />
                        <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Cargando…</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Toolbar: search + filter pills */}
                        {companies.length > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div className="w-full sm:max-w-xs">
                                    <BaseInput.Field
                                        type="search"
                                        placeholder="Buscar por nombre o RIF…"
                                        value={search}
                                        onValueChange={setSearch}
                                        startContent={<Search size={14} className="text-[var(--text-tertiary)]" />}
                                    />
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <FilterPill active={filter === "todas"}      onClick={() => setFilter("todas")}>Todas</FilterPill>
                                    <FilterPill active={filter === "especial"}   onClick={() => setFilter("especial")}   count={filterCounts.especial}>Especial</FilterPill>
                                    <FilterPill active={filter === "ordinario"}  onClick={() => setFilter("ordinario")}  count={filterCounts.ordinario}>Ordinario</FilterPill>
                                    <FilterPill active={filter === "sin_sector"} onClick={() => setFilter("sin_sector")} count={filterCounts.sinSector}>Sin sector</FilterPill>
                                    {filterCounts.incompletas > 0 && (
                                        <FilterPill active={filter === "incompletas"} onClick={() => setFilter("incompletas")} count={filterCounts.incompletas}>Incompletas</FilterPill>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="border border-border-light rounded-2xl overflow-hidden bg-surface-1 shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-surface-2/60 border-b border-border-light">
                                            {["RIF", "Nombre", "Teléfono", "Dirección", "Sector", "Tipo", "Creada", ""].map((h) => (
                                                <th key={h} className={[
                                                    "px-5 py-3 font-mono font-medium text-[var(--text-tertiary)] uppercase tracking-[0.14em] text-[11px]",
                                                    (h === "Creada" || h === "Teléfono" || h === "Dirección" || h === "Sector" || h === "Tipo") ? "hidden sm:table-cell" : "",
                                                ].join(" ")}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-light/40">

                                        {showNew && (
                                            <tr className="bg-primary-500/[0.04] border-l-2 border-l-primary-500/40">
                                                {/* RIF */}
                                                <td className="px-5 py-4 w-40">
                                                    <BaseInput.Field
                                                        autoFocus
                                                        className="w-full"
                                                        placeholder="J-12345678-9"
                                                        value={newRif}
                                                        onValueChange={setNewRif}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") saveNew();
                                                            if (e.key === "Escape") cancelNew();
                                                        }}
                                                    />
                                                </td>
                                                {/* Nombre */}
                                                <td className="px-5 py-4">
                                                    <BaseInput.Field
                                                        className="w-full"
                                                        placeholder="Razón social"
                                                        value={newName}
                                                        onValueChange={setNewName}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") saveNew();
                                                            if (e.key === "Escape") cancelNew();
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <span className="text-[11px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <span className="text-[11px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <span className="text-[11px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <InlineSelect
                                                        value={newTaxpayerType}
                                                        onChange={(v) => setNewTaxpayerType(v)}
                                                        options={TAXPAYER_OPTIONS}
                                                        ariaLabel="Tipo de contribuyente"
                                                        size="sm"
                                                    />
                                                </td>
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <span className="text-[11px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    {newSaving ? (
                                                        <div className="flex justify-end"><Spinner /></div>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <BaseButton.Icon variant="ghost" size="sm" onClick={saveNew} className="text-[var(--text-success)] hover:bg-[var(--badge-success-bg)]">
                                                                <IconSave />
                                                            </BaseButton.Icon>
                                                            <BaseButton.Icon variant="ghost" size="sm" onClick={cancelNew} className="text-[var(--text-tertiary)]">
                                                                <IconCancel />
                                                            </BaseButton.Icon>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}

                                        {/* Existing rows */}
                                        {filtered.length === 0 && !showNew ? (
                                            <tr>
                                                <td colSpan={8} className="px-5 py-20">
                                                    <div className="flex flex-col items-center justify-center text-center gap-4 max-w-sm mx-auto">
                                                        <div className="w-14 h-14 rounded-2xl border border-primary-500/20 bg-primary-500/[0.06] flex items-center justify-center text-primary-500">
                                                            <Building2 size={26} strokeWidth={1.4} />
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <p className="font-mono text-[12px] uppercase tracking-[0.16em] font-semibold text-foreground">
                                                                {companies.length === 0
                                                                    ? "Sin empresas registradas"
                                                                    : filter !== "todas"
                                                                        ? "Sin resultados en este filtro"
                                                                        : "Búsqueda sin resultados"}
                                                            </p>
                                                            <p className="font-sans text-[14px] text-[var(--text-secondary)] leading-snug">
                                                                {companies.length === 0
                                                                    ? "Crea tu primera empresa para comenzar a gestionar nómina, inventario y contabilidad."
                                                                    : filter !== "todas"
                                                                        ? "Cambia el filtro o limpia la búsqueda para ver más resultados."
                                                                        : "Intenta con otro término de búsqueda."}
                                                            </p>
                                                        </div>
                                                        {companies.length === 0 ? (
                                                            <BaseButton.Root
                                                                variant="primary"
                                                                size="sm"
                                                                onClick={() => { setShowNew(true); setNewRif(""); setNewName(""); }}
                                                                isDisabled={atCompanyLimit}
                                                                leftIcon={<IconPlus />}
                                                            >
                                                                Crear primera empresa
                                                            </BaseButton.Root>
                                                        ) : (
                                                            <BaseButton.Root
                                                                variant="secondary"
                                                                size="sm"
                                                                onClick={() => { setSearch(""); setFilter("todas"); }}
                                                            >
                                                                Limpiar filtros
                                                            </BaseButton.Root>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filtered.map((company) => {
                                                const isEditing = editingId === company.id;
                                                const isConfirm = confirmId === company.id;
                                                const isActive = company.id === companyId;

                                                return (
                                                    <tr
                                                        key={company.id}
                                                        data-active={isActive || undefined}
                                                        className={[
                                                            "group transition-colors duration-100 relative",
                                                            isActive
                                                                ? "bg-primary-500/[0.035] hover:bg-primary-500/[0.06]"
                                                                : "hover:bg-surface-2/50",
                                                        ].join(" ")}
                                                    >

                                                        {/* RIF */}
                                                        <td className="pl-5 pr-5 py-4 w-40 relative">
                                                            {isActive && (
                                                                <span
                                                                    aria-hidden
                                                                    className="absolute left-0 top-2 bottom-2 w-[2px] bg-primary-500 rounded-r-sm"
                                                                />
                                                            )}
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-mono text-[12px] text-[var(--text-secondary)] tracking-tight">
                                                                    {company.id}
                                                                </span>
                                                                {isActive && (
                                                                    <span className="hidden md:inline-flex items-center gap-1 px-1.5 py-px rounded-sm font-mono text-[9px] uppercase tracking-[0.14em] font-semibold bg-primary-500/10 text-[var(--text-link)] border border-primary-500/20">
                                                                        <CircleDot size={8} strokeWidth={2.4} /> Activa
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>

                                                        {/* Nombre */}
                                                        <td className="px-5 py-4">
                                                            {isEditing ? (
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => logoInputRef.current?.click()}
                                                                            disabled={logoUploading}
                                                                            className={[
                                                                                "relative w-9 h-9 rounded-lg overflow-hidden bg-primary-500/5 flex items-center justify-center shrink-0",
                                                                                "border transition-all duration-200",
                                                                                logoUploadSuccess
                                                                                    ? "border-[var(--badge-success-border)] ring-4 ring-[var(--badge-success-bg)]/40"
                                                                                    : "border-border-light hover:border-primary-500/40 hover:bg-primary-500/10",
                                                                            ].join(" ")}
                                                                        >
                                                                            {editLogoUrl ? (
                                                                                <Image
                                                                                    src={editLogoUrl}
                                                                                    alt={`Logo`}
                                                                                    fill
                                                                                    unoptimized
                                                                                    sizes="36px"
                                                                                    className={["object-cover", logoUploading ? "opacity-30" : ""].join(" ")}
                                                                                />
                                                                            ) : (
                                                                                <span className="font-bold text-primary-500 text-[12px]">{editName[0] ?? "?"}</span>
                                                                            )}
                                                                            {logoUploading && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Spinner /></div>}
                                                                            {!logoUploading && <div className="absolute bottom-0 right-0 p-0.5 bg-surface-1 rounded-tl-md text-primary-500 shadow-sm"><IconCamera /></div>}
                                                                        </button>
                                                                        <BaseInput.Field
                                                                            autoFocus
                                                                            className="w-full"
                                                                            value={editName}
                                                                            onValueChange={setEditName}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter") saveEdit();
                                                                                if (e.key === "Escape") cancelEdit();
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <div className="sm:hidden grid grid-cols-2 gap-2">
                                                                        <BaseInput.Field className="w-full" placeholder="Teléfono" value={editPhone} onValueChange={setEditPhone} />
                                                                        <BaseInput.Field className="w-full" placeholder="Dirección" value={editAddress} onValueChange={setEditAddress} />
                                                                        <BaseInput.Field className="w-full col-span-2" placeholder="Correo del cliente" type="email" value={editContactEmail} onValueChange={setEditContactEmail} />
                                                                    </div>
                                                                    <input
                                                                        ref={logoInputRef}
                                                                        type="file"
                                                                        accept="image/*"
                                                                        className="sr-only"
                                                                        onChange={handleLogoUpload}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => !isActive && selectCompany(company.id)}
                                                                    disabled={isActive}
                                                                    title={isActive ? "Empresa activa" : "Establecer como empresa activa"}
                                                                    className={[
                                                                        "flex items-center gap-3 text-left w-full",
                                                                        isActive ? "cursor-default" : "cursor-pointer",
                                                                    ].join(" ")}
                                                                >
                                                                    <div className={[
                                                                        "relative w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shrink-0 border",
                                                                        isActive
                                                                            ? "bg-primary-500/10 border-primary-500/30"
                                                                            : "bg-surface-2 border-border-light/60",
                                                                    ].join(" ")}>
                                                                        {company.logoUrl ? (
                                                                            <Image src={company.logoUrl} alt={company.name} fill unoptimized sizes="36px" className="object-cover" />
                                                                        ) : (
                                                                            <Building2 className={isActive ? "text-primary-500" : "text-[var(--text-tertiary)]"} size={15} strokeWidth={1.6} />
                                                                        )}
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <span className="block text-[14px] font-medium text-foreground tracking-tight truncate">
                                                                            {company.name}
                                                                        </span>
                                                                        {!company.phone && !company.address && !company.sector && (
                                                                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                                                                Perfil pendiente
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </button>
                                                            )}
                                                        </td>

                                                        {/* Teléfono */}
                                                        <td className="px-5 py-4 hidden sm:table-cell">
                                                            {isEditing ? (
                                                                <BaseInput.Field className="w-full" value={editPhone} onValueChange={setEditPhone} />
                                                            ) : (
                                                                <span className="text-[13px] text-[var(--text-secondary)] tabular-nums">{company.phone ?? "—"}</span>
                                                            )}
                                                        </td>

                                                        {/* Dirección + correo del cliente */}
                                                        <td className="px-5 py-4 hidden sm:table-cell">
                                                            {isEditing ? (
                                                                <div className="flex flex-col gap-1.5">
                                                                    <BaseInput.Field className="w-full" placeholder="Dirección" value={editAddress} onValueChange={setEditAddress} />
                                                                    <BaseInput.Field className="w-full" placeholder="Correo del cliente" type="email" value={editContactEmail} onValueChange={setEditContactEmail} />
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col leading-tight">
                                                                    <span className="text-[13px] text-[var(--text-secondary)] truncate max-w-[180px] inline-block">{company.address ?? "—"}</span>
                                                                    {company.contactEmail && (
                                                                        <span className="font-mono text-[11px] text-[var(--text-tertiary)] truncate max-w-[180px] inline-block">{company.contactEmail}</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Sector */}
                                                        <td className="px-5 py-4 hidden sm:table-cell">
                                                            {isEditing ? (
                                                                <InlineSelect
                                                                    value={editSector}
                                                                    onChange={(v) => setEditSector((v || undefined) as BusinessSector | undefined)}
                                                                    options={SECTOR_OPTIONS}
                                                                    ariaLabel="Sector de la empresa"
                                                                    size="sm"
                                                                    clearable
                                                                    clearLabel="Sin sector"
                                                                />
                                                            ) : (
                                                                company.sector ? (
                                                                    <span className={[
                                                                        "inline-flex items-center px-2 py-0.5 rounded-sm",
                                                                        "font-mono text-[11px] uppercase tracking-[0.10em]",
                                                                        "bg-surface-2 border border-border-light text-[var(--text-secondary)]",
                                                                    ].join(" ")}>
                                                                        {SECTOR_LABELS[company.sector]}
                                                                    </span>
                                                                ) : (
                                                                    <span className="font-mono text-[12px] text-[var(--text-disabled)]">—</span>
                                                                )
                                                            )}
                                                        </td>

                                                        {/* Tipo (Contribuyente) */}
                                                        <td className="px-5 py-4 hidden sm:table-cell">
                                                            {isEditing ? (
                                                                <InlineSelect
                                                                    value={editTaxpayerType}
                                                                    onChange={(v) => setEditTaxpayerType(v)}
                                                                    options={TAXPAYER_OPTIONS}
                                                                    ariaLabel="Tipo de contribuyente"
                                                                    size="sm"
                                                                />
                                                            ) : (
                                                                <TaxpayerTypeBadge type={company.taxpayerType ?? "ordinario"} />
                                                            )}
                                                        </td>

                                                        {/* Creada */}
                                                        <td className="px-5 py-4 hidden sm:table-cell">
                                                            <span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap tabular-nums font-mono">
                                                                {formatDate(company.createdAt)}
                                                            </span>
                                                        </td>

                                                        {/* Actions */}
                                                        <td className="px-5 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {isConfirm ? (
                                                                    <div className="flex items-center gap-1 px-1.5 py-1 rounded-lg border border-[var(--badge-error-border)] bg-[var(--badge-error-bg)]">
                                                                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-error)] pl-1 pr-2 hidden md:inline">
                                                                            ¿Eliminar?
                                                                        </span>
                                                                        <BaseButton.Root variant="danger" size="sm" onClick={() => handleDelete(company.id)} loading={deleting} className="h-7 px-2.5 text-[10px]">
                                                                            Sí, eliminar
                                                                        </BaseButton.Root>
                                                                        <BaseButton.Root variant="secondary" size="sm" onClick={() => setConfirmId(null)} className="h-7 px-2 text-[10px]">
                                                                            No
                                                                        </BaseButton.Root>
                                                                    </div>
                                                                ) : editSaving && isEditing ? (
                                                                    <Spinner />
                                                                ) : isEditing ? (
                                                                    <>
                                                                        <BaseButton.Icon variant="ghost" size="sm" onClick={saveEdit} className="text-[var(--text-success)] hover:bg-[var(--badge-success-bg)]">
                                                                            <IconSave />
                                                                        </BaseButton.Icon>
                                                                        <BaseButton.Icon variant="ghost" size="sm" onClick={cancelEdit}>
                                                                            <IconCancel />
                                                                        </BaseButton.Icon>
                                                                    </>
                                                                ) : (
                                                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-data-[active=true]:opacity-100 transition-opacity">
                                                                        {!isActive && (
                                                                            <BaseButton.Icon
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => selectCompany(company.id)}
                                                                                title="Activar empresa"
                                                                                className="text-[var(--text-tertiary)] hover:text-primary-500"
                                                                            >
                                                                                <Star size={14} />
                                                                            </BaseButton.Icon>
                                                                        )}
                                                                        <BaseButton.Icon variant="ghost" size="sm" onClick={() => startEdit(company)} title="Editar">
                                                                            <IconEdit />
                                                                        </BaseButton.Icon>
                                                                        <BaseButton.Icon
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => setConfirmId(company.id)}
                                                                            title="Eliminar"
                                                                            className="hover:text-[var(--text-error)] hover:bg-[var(--badge-error-bg)]"
                                                                        >
                                                                            <IconTrash />
                                                                        </BaseButton.Icon>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer counter */}
                            {filtered.length > 0 && companies.length > 0 && (
                                <div className="flex items-center justify-between px-5 py-2.5 border-t border-border-light bg-surface-2/40">
                                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                        Mostrando {filtered.length} de {companies.length}
                                    </span>
                                    {filter !== "todas" || search ? (
                                        <button
                                            type="button"
                                            onClick={() => { setSearch(""); setFilter("todas"); }}
                                            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-link)] hover:text-[var(--text-link-hover)] transition-colors"
                                        >
                                            Limpiar filtros
                                        </button>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* ── Paste CSV Modal ─────────────────────────────────────────────── */}
            <AnimatePresence>
                {pasteOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closePasteModal}
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
                            className="relative w-full max-w-lg bg-surface-1 border border-border-light rounded-2xl shadow-lg overflow-hidden flex flex-col"
                        >
                            {/* Modal header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-2/40">
                                <div>
                                    <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                        Importar desde CSV
                                    </h2>
                                    <p className="font-mono text-[10px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-[0.12em]">
                                        Columnas: rif · nombre · tipo_contribuyente (opcional)
                                    </p>
                                </div>
                                <BaseButton.Icon variant="ghost" size="sm" onClick={closePasteModal}>
                                    <IconCancel />
                                </BaseButton.Icon>
                            </div>

                            {/* Textarea */}
                            <div className="p-6 space-y-4">
                                <div className="relative">
                                    <textarea
                                        autoFocus
                                        rows={8}
                                        value={pasteText}
                                        onChange={(e) => handlePasteChange(e.target.value)}
                                        placeholder={`"rif","nombre","tipo_contribuyente"\n"J-12345678-9","Mi Empresa S.A.","ordinario"`}
                                        className={[
                                            "w-full resize-none rounded-xl border bg-surface-2/50 outline-none p-4",
                                            "font-mono text-[12px] text-foreground leading-relaxed",
                                            "border-border-light focus:border-primary-500/50 focus:ring-4 focus:ring-primary-500/5",
                                            "transition-colors duration-200 placeholder:text-[var(--text-disabled)]",
                                        ].join(" ")}
                                    />
                                    {!pasteText.trim() && (
                                        <button
                                            type="button"
                                            onClick={insertPasteExample}
                                            className="absolute bottom-3 right-3 font-mono text-[10px] uppercase tracking-[0.14em] px-2 py-1 rounded-md bg-surface-1 border border-border-light text-[var(--text-tertiary)] hover:text-[var(--text-link)] hover:border-primary-500/30 transition-colors"
                                        >
                                            Pegar ejemplo
                                        </button>
                                    )}
                                </div>

                                {/* Validation feedback */}
                                {pasteText.trim() && pasteErrors.length === 0 && pasteCount !== null && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--badge-success-bg)] border border-[var(--badge-success-border)]">
                                        <Check size={14} className="text-[var(--text-success)]" />
                                        <p className="font-sans text-[13px] text-[var(--text-success)]">
                                            {pasteCount} empresa{pasteCount !== 1 ? "s" : ""} lista{pasteCount !== 1 ? "s" : ""} para importar.
                                        </p>
                                    </div>
                                )}
                                {pasteErrors.length > 0 && (
                                    <div className="px-3 py-2 rounded-lg bg-[var(--badge-error-bg)] border border-[var(--badge-error-border)] space-y-1">
                                        {pasteErrors.slice(0, 2).map((e, i) => (
                                            <p key={i} className="font-sans text-[12px] text-[var(--text-error)] flex items-center gap-1.5">
                                                <X size={12} /> {e}
                                            </p>
                                        ))}
                                        {pasteErrors.length > 2 && (
                                            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] pl-5">
                                                …y {pasteErrors.length - 2} errores más.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Modal footer */}
                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light bg-surface-2/40">
                                <BaseButton.Root variant="secondary" size="sm" onClick={closePasteModal}>
                                    Cancelar
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="primary"
                                    size="sm"
                                    onClick={handlePasteImport}
                                    isDisabled={pasteImporting || pasteErrors.length > 0 || !pasteText.trim() || pasteCount === 0}
                                    loading={pasteImporting}
                                    leftIcon={<IconPaste />}
                                >
                                    Importar {pasteCount && pasteCount > 0 ? `(${pasteCount})` : "ahora"}
                                </BaseButton.Root>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
