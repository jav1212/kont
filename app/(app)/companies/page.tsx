"use client";

import Image from "next/image";
import { useState, useRef, useCallback } from "react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { Company } from "@/src/modules/companies/frontend/hooks/use-companies";
import { companiesToCsv, downloadCsv, parseCompaniesCsv } from "@/src/modules/companies/frontend/utils/company-csv";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
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
    Loader2
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// ============================================================================
// CONSTANTS
// ============================================================================

const cellInput = [
    "w-full h-8 px-2.5 rounded-lg border bg-surface-1 outline-none",
    "font-mono text-base sm:text-[12px] text-foreground",
    "border-border-light focus:border-primary-500/60 hover:border-border-medium",
    "transition-colors duration-150 placeholder:text-[var(--text-disabled)]",
].join(" ");

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
// PAGE
// ============================================================================

export default function CompaniesPage() {
    const { companies, loading, error, save, update, remove } = useCompany();
    const { capacity, canAddCompany } = useCapacity();
    const { user } = useAuth();
    const atCompanyLimit = !canAddCompany();

    // ── Edit state ────────────────────────────────────────────────────────
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editPhone, setEditPhone] = useState("");
    const [editAddress, setEditAddress] = useState("");
    const [editLogoUrl, setEditLogoUrl] = useState<string | undefined>(undefined);
    const [logoUploading, setLogoUploading] = useState(false);
    const [logoUploadSuccess, setLogoUploadSuccess] = useState(false);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState<string | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);

    // ── New row state ──────────────────────────────────────────────────────
    const [showNew, setShowNew] = useState(false);
    const [newRif, setNewRif] = useState("");
    const [newName, setNewName] = useState("");
    const [newSaving, setNewSaving] = useState(false);
    const [newError, setNewError] = useState<string | null>(null);

    // ── Delete confirm state ───────────────────────────────────────────────
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // ── CSV state ──────────────────────────────────────────────────────────
    const [csvLoading, setCsvLoading] = useState(false);
    const [csvError, setCsvError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Paste modal state ──────────────────────────────────────────────────
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState("");
    const [pasteErrors, setPasteErrors] = useState<string[]>([]);
    const [pasteCount, setPasteCount] = useState<number | null>(null);
    const [pasteImporting, setPasteImporting] = useState(false);

    // ── Search ─────────────────────────────────────────────────────────────
    const [search, setSearch] = useState("");

    // ── Filtered companies ─────────────────────────────────────────────────
    const filtered = companies.filter((c) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    });

    // ── Edit actions ───────────────────────────────────────────────────────

    const startEdit = useCallback((company: Company) => {
        setEditingId(company.id);
        setEditName(company.name);
        setEditPhone(company.phone ?? "");
        setEditAddress(company.address ?? "");
        setEditLogoUrl(company.logoUrl);
        setEditError(null);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditName("");
        setEditPhone("");
        setEditAddress("");
        setEditLogoUrl(undefined);
        setEditError(null);
        setLogoUploadSuccess(false);
    }, []);

    const saveEdit = useCallback(async () => {
        if (!editingId || !editName.trim()) return;
        setEditSaving(true);
        setEditError(null);
        const err = await update(editingId, {
            name: editName.trim(),
            phone: editPhone.trim() || undefined,
            address: editAddress.trim() || undefined,
            logoUrl: editLogoUrl,
        });
        setEditSaving(false);
        if (err) { setEditError(err); } else { cancelEdit(); }
    }, [editingId, editName, editPhone, editAddress, editLogoUrl, update, cancelEdit]);

    const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user || !editingId) return;

        const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
        if (file.size > MAX_BYTES) {
            setEditError("El logo debe ser menor a 2 MB.");
            if (logoInputRef.current) logoInputRef.current.value = "";
            return;
        }

        setLogoUploading(true);
        setLogoUploadSuccess(false);
        // Keep any existing editError visible until the new attempt resolves
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${editingId}/logo.${ext}`;
        const { error: uploadErr } = await getSupabaseBrowser().storage
            .from("logos")
            .upload(path, file, { upsert: true });
        if (uploadErr) {
            console.error("[logo-upload]", uploadErr);
            setEditError("No se pudo subir el logo. Verifica el archivo e intenta de nuevo.");
            setLogoUploading(false);
            if (logoInputRef.current) logoInputRef.current.value = "";
            return;
        }
        const { data: { publicUrl } } = getSupabaseBrowser().storage.from("logos").getPublicUrl(path);
        setEditLogoUrl(publicUrl);
        setEditError(null); // clear only after confirmed success
        setLogoUploading(false);
        setLogoUploadSuccess(true);
        setTimeout(() => setLogoUploadSuccess(false), 1800);
        if (logoInputRef.current) logoInputRef.current.value = "";
    }, [user, editingId]);

    // ── New actions ────────────────────────────────────────────────────────

    const saveNew = useCallback(async () => {
        if (!newRif.trim()) { setNewError("El RIF es obligatorio"); return; }
        if (!newName.trim()) { setNewError("El nombre es obligatorio"); return; }
        setNewSaving(true);
        setNewError(null);
        const err = await save({ id: newRif.trim().toUpperCase(), name: newName.trim() });
        setNewSaving(false);
        if (err) { setNewError(err); } else { setShowNew(false); setNewRif(""); setNewName(""); }
    }, [newRif, newName, save]);

    const cancelNew = useCallback(() => {
        setShowNew(false);
        setNewRif("");
        setNewName("");
        setNewError(null);
    }, []);

    // ── Delete actions ─────────────────────────────────────────────────────

    const handleDelete = useCallback(async (id: string) => {
        setDeleting(true);
        setDeleteError(null);
        const err = await remove(id);
        setDeleting(false);
        if (err) { setDeleteError(err); } else { setConfirmId(null); }
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
        setCsvError(null);
        setCsvLoading(true);
        const { companies: parsed, errors } = parseCompaniesCsv(await file.text());
        if (errors.length > 0) {
            setCsvError(errors[0]);
            setCsvLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }
        let firstErr: string | null = null;
        for (const row of parsed) {
            const err = await save({ id: row.rif, name: row.nombre });
            if (err && !firstErr) firstErr = err;
        }
        if (firstErr) setCsvError(firstErr);
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
            const err = await save({ id: row.rif, name: row.nombre });
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
                            onClick={() => { setShowNew(true); setNewRif(""); setNewName(""); setNewError(null); }}
                            isDisabled={showNew || atCompanyLimit}
                            title={atCompanyLimit ? "Límite de empresas alcanzado" : undefined}
                            leftIcon={<IconPlus />}
                        >
                    </BaseButton.Root>
                </div>
            </PageHeader>

            <div className="px-8 py-6 space-y-6">

                {/* Errors */}
                {(deleteError || error || csvError) && (
                    <div className="px-3 py-2 border border-red-500/20 rounded-lg bg-red-500/[0.05]">
                        <p className="font-mono text-[10px] text-red-500">{deleteError ?? csvError ?? error}</p>
                    </div>
                )}

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center h-32 gap-2 border border-border-light rounded-xl">
                        <Spinner />
                        <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Cargando…</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Search */}
                        <div className="relative group max-w-md">
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-primary-500 transition-colors"
                                size={15}
                            />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o RIF…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className={[
                                    "w-full h-10 pl-10 pr-4 rounded-xl border border-border-light bg-surface-1 outline-none",
                                    "text-[14px] text-foreground placeholder:text-[var(--text-disabled)]",
                                    "focus:border-primary-500/50 focus:ring-4 focus:ring-primary-500/5 hover:border-border-medium transition-all duration-200",
                                ].join(" ")}
                            />
                        </div>

                        <div className="border border-border-light rounded-2xl overflow-hidden bg-surface-1 shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-surface-2/50 border-b border-border-light">
                                            {["RIF", "Nombre", "Teléfono", "Dirección", "Creada", ""].map((h) => (
                                                <th key={h} className={[
                                                    "px-5 py-3.5 font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-[11px]",
                                                    (h === "Creada" || h === "Teléfono" || h === "Dirección") ? "hidden sm:table-cell" : "",
                                                ].join(" ")}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-light/40">

                                        {showNew && (
                                            <tr className="bg-primary-500/[0.03]">
                                                {/* RIF */}
                                                <td className="px-5 py-4 w-40">
                                                    <input
                                                        autoFocus
                                                        className={cellInput}
                                                        placeholder="J-12345678-9"
                                                        value={newRif}
                                                        onChange={(e) => setNewRif(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") saveNew();
                                                            if (e.key === "Escape") cancelNew();
                                                        }}
                                                    />
                                                </td>
                                                {/* Nombre */}
                                                <td className="px-5 py-4">
                                                    <div>
                                                        <input
                                                            className={cellInput}
                                                            placeholder="Razón social"
                                                            value={newName}
                                                            onChange={(e) => setNewName(e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") saveNew();
                                                                if (e.key === "Escape") cancelNew();
                                                            }}
                                                        />
                                                        {newError && (
                                                            <p className="text-[10px] text-red-500 mt-1">{newError}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                {/* Teléfono / Dirección — empty on new row */}
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <span className="text-[11px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <span className="text-[11px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className="px-5 py-4 hidden sm:table-cell">
                                                    <span className="text-[11px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    {newSaving ? (
                                                        <div className="flex justify-end"><Spinner /></div>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <BaseButton.Icon variant="ghost" size="sm" onClick={saveNew} className="text-green-600 hover:text-green-700 hover:bg-green-50">
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
                                                <td colSpan={6} className="px-5 py-24 text-center">
                                                    <div className="flex flex-col items-center justify-center space-y-3 opacity-40">
                                                        <Building2 size={40} strokeWidth={1} />
                                                        <p className="text-[13px] uppercase tracking-widest font-medium">
                                                            {companies.length === 0
                                                                ? "Sin empresas registradas"
                                                                : "Búsqueda sin resultados"}
                                                        </p>
                                                        <p className="text-[11px] normal-case tracking-normal">
                                                            {companies.length === 0
                                                                ? "Crea una nueva empresa para comenzar a gestionar tu nómina."
                                                                : "Intenta con otro término de búsqueda."}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filtered.map((company) => {
                                                const isEditing = editingId === company.id;
                                                const isConfirm = confirmId === company.id;

                                                return (
                                                    <tr key={company.id} className="transition-colors duration-100 group hover:bg-surface-2/40">

                                                        {/* RIF */}
                                                        <td className="px-5 py-4 w-40">
                                                            <span className="font-mono text-[12px] text-[var(--text-secondary)] tracking-tight">
                                                                {company.id}
                                                            </span>
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
                                                                                "relative w-8 h-8 rounded-lg overflow-hidden bg-primary-500/5 flex items-center justify-center shrink-0",
                                                                                "border transition-all duration-200",
                                                                                logoUploadSuccess
                                                                                    ? "border-green-500/50 ring-4 ring-green-500/5"
                                                                                    : "border-border-light hover:border-primary-500/40 hover:bg-primary-500/10",
                                                                            ].join(" ")}
                                                                        >
                                                                            {editLogoUrl ? (
                                                                                <Image
                                                                                    src={editLogoUrl}
                                                                                    alt={`Logo`}
                                                                                    fill
                                                                                    unoptimized
                                                                                    sizes="32px"
                                                                                    className={["object-cover", logoUploading ? "opacity-30" : ""].join(" ")}
                                                                                />
                                                                            ) : (
                                                                                <span className="font-bold text-primary-500 text-[11px]">{editName[0] ?? "?"}</span>
                                                                            )}
                                                                            {logoUploading && <div className="absolute inset-0 flex items-center justify-center bg-white/60"><Spinner /></div>}
                                                                            {!logoUploading && <div className="absolute bottom-0 right-0 p-0.5 bg-surface-1 rounded-tl-md text-primary-500 shadow-sm"><IconCamera /></div>}
                                                                        </button>
                                                                        <input
                                                                            autoFocus
                                                                            className={cellInput}
                                                                            value={editName}
                                                                            onChange={(e) => setEditName(e.target.value)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter") saveEdit();
                                                                                if (e.key === "Escape") cancelEdit();
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    {editError && <p className="text-[10px] text-red-500">{editError}</p>}
                                                                    <div className="sm:hidden grid grid-cols-2 gap-2">
                                                                        <input className={cellInput} placeholder="Teléfono" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                                                                        <input className={cellInput} placeholder="Dirección" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
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
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-surface-2 border border-border-light/50 flex items-center justify-center shrink-0">
                                                                        {company.logoUrl ? (
                                                                            <Image src={company.logoUrl} alt={company.name} fill unoptimized sizes="32px" className="object-cover" />
                                                                        ) : (
                                                                            <Building2 className="text-[var(--text-tertiary)]" size={14} strokeWidth={1.5} />
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[14px] font-medium text-foreground tracking-tight">
                                                                        {company.name}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Teléfono */}
                                                        <td className="px-5 py-4 hidden sm:table-cell">
                                                            {isEditing ? (
                                                                <input className={cellInput} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                                                            ) : (
                                                                <span className="text-[13px] text-[var(--text-secondary)]">{company.phone ?? "—"}</span>
                                                            )}
                                                        </td>

                                                        {/* Dirección */}
                                                        <td className="px-5 py-4 hidden sm:table-cell">
                                                            {isEditing ? (
                                                                <input className={cellInput} value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
                                                            ) : (
                                                                <span className="text-[13px] text-[var(--text-secondary)] truncate max-w-[150px] inline-block">{company.address ?? "—"}</span>
                                                            )}
                                                        </td>

                                                        {/* Creada */}
                                                        <td className="px-5 py-4 hidden sm:table-cell">
                                                            <span className="text-[12px] text-[var(--text-tertiary)] whitespace-nowrap">
                                                                {formatDate(company.createdAt)}
                                                            </span>
                                                        </td>

                                                        {/* Actions */}
                                                        <td className="px-5 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {isConfirm ? (
                                                                    <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg border border-red-100">
                                                                        <BaseButton.Root variant="danger" size="sm" onClick={() => handleDelete(company.id)} loading={deleting} className="h-7 px-2 text-[10px]">Eliminar</BaseButton.Root>
                                                                        <BaseButton.Root variant="secondary" size="sm" onClick={() => setConfirmId(null)} className="h-7 px-2 text-[10px]">No</BaseButton.Root>
                                                                    </div>
                                                                ) : editSaving && isEditing ? (
                                                                    <Spinner />
                                                                ) : isEditing ? (
                                                                    <>
                                                                        <BaseButton.Icon variant="ghost" size="sm" onClick={saveEdit} className="text-green-600 hover:text-green-700">
                                                                            <IconSave />
                                                                        </BaseButton.Icon>
                                                                        <BaseButton.Icon variant="ghost" size="sm" onClick={cancelEdit}>
                                                                            <IconCancel />
                                                                        </BaseButton.Icon>
                                                                    </>
                                                                ) : (
                                                                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <BaseButton.Icon variant="ghost" size="sm" onClick={() => startEdit(company)}>
                                                                            <IconEdit />
                                                                        </BaseButton.Icon>
                                                                        <BaseButton.Icon variant="ghost" size="sm" onClick={() => setConfirmId(company.id)} className="hover:text-red-500">
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
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative w-full max-w-lg bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                        >
                            {/* Modal header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-2/30">
                                <div>
                                    <h2 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                        Importar Datos
                                    </h2>
                                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-wider">
                                        CSV · Columnas: rif, nombre
                                    </p>
                                </div>
                                <BaseButton.Icon variant="ghost" size="sm" onClick={closePasteModal}>
                                    <IconCancel />
                                </BaseButton.Icon>
                            </div>

                            {/* Textarea */}
                            <div className="p-6 space-y-4">
                                <textarea
                                    autoFocus
                                    rows={8}
                                    value={pasteText}
                                    onChange={(e) => handlePasteChange(e.target.value)}
                                    placeholder={`"rif","nombre"\n"J-12345678-9","Mi Empresa S.A."`}
                                    className={[
                                        "w-full resize-none rounded-xl border bg-surface-2/50 outline-none p-4",
                                        "font-mono text-[12px] text-foreground leading-relaxed",
                                        "border-border-light focus:border-primary-500/50 focus:ring-4 focus:ring-primary-500/5",
                                        "transition-all duration-200 placeholder:text-[var(--text-disabled)]",
                                    ].join(" ")}
                                />

                                {/* Validation feedback */}
                                {pasteText.trim() && pasteErrors.length === 0 && pasteCount !== null && (
                                    <div className="flex items-center gap-2 text-green-600">
                                        <Check size={14} />
                                        <p className="text-[11px] font-medium">
                                            {pasteCount} empresa{pasteCount !== 1 ? "s" : ""} lista{pasteCount !== 1 ? "s" : ""} para importar.
                                        </p>
                                    </div>
                                )}
                                {pasteErrors.length > 0 && (
                                    <div className="p-3 rounded-lg bg-red-50 border border-red-100 space-y-1">
                                        {pasteErrors.slice(0, 2).map((e, i) => (
                                            <p key={i} className="text-[10px] text-red-600 flex items-center gap-1.5"><X size={10} /> {e}</p>
                                        ))}
                                        {pasteErrors.length > 2 && (
                                            <p className="text-[10px] text-[var(--text-tertiary)] pl-4">…y {pasteErrors.length - 2} errores más.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Modal footer */}
                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light bg-surface-2/30">
                                <BaseButton.Root variant="secondary" size="sm" onClick={closePasteModal}>
                                    Cancelar
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="primary"
                                    size="sm"
                                    onClick={handlePasteImport}
                                    disabled={pasteImporting || pasteErrors.length > 0 || !pasteText.trim() || pasteCount === 0}
                                    loading={pasteImporting}
                                    leftIcon={<IconPaste />}
                                >
                                    Importar ahora
                                </BaseButton.Root>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
