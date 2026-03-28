"use client";

import { useState, useRef, useCallback } from "react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { Company } from "@/src/modules/companies/frontend/hooks/use-companies";
import { companiesToCsv, downloadCsv, parseCompaniesCsv } from "@/src/modules/companies/frontend/utils/company-csv";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";
import { useAuth } from "@/src/modules/auth/frontend/hooks/use-auth";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";

// ============================================================================
// CONSTANTS
// ============================================================================

const cellInput = [
    "w-full h-8 px-2.5 rounded-lg border bg-surface-1 outline-none",
    "font-mono text-base sm:text-[12px] text-foreground",
    "border-border-light focus:border-primary-500/60 hover:border-border-medium",
    "transition-colors duration-150 placeholder:text-[var(--text-disabled)]",
].join(" ");

// Compact secondary toolbar button — shared via APP_SIZES.button.toolbarBtn.
// Applied directly as className when the element must be a <label> (file input trigger).
const toolbarBtn = APP_SIZES.button.toolbarBtn;

// ============================================================================
// ICONS
// ============================================================================

const Spinner = () => (
    <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);
const IconSave = () => (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 7l3.5 3.5L11 3" />
    </svg>
);
const IconCancel = () => (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2l9 9M11 2l-9 9" />
    </svg>
);
const IconEdit = () => (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 1.5l2.5 2.5L4 11.5H1.5V9L9 1.5z" />
    </svg>
);
const IconTrash = () => (
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5h9M4.5 3.5V2.5h4v1M5 6v4M8 6v4M3 3.5l.5 7h6l.5-7" />
    </svg>
);
const IconPlus = () => (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 1v10M1 6h10" />
    </svg>
);
const IconCamera = () => (
    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 4.5a1 1 0 0 1 1-1h1l1-1.5h4l1 1.5h1a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-5z" />
        <circle cx="6" cy="7" r="1.5" />
    </svg>
);

// ============================================================================
// PAGE
// ============================================================================

export default function CompaniesPage() {
    const { companies, loading, error, save, update, remove } = useCompany();
    const { capacity, canAddCompany } = useCapacity();
    const { user } = useAuth();
    const atCompanyLimit = !canAddCompany();

    // ── Edit state ────────────────────────────────────────────────────────
    const [editingId,      setEditingId]      = useState<string | null>(null);
    const [editName,       setEditName]       = useState("");
    const [editPhone,      setEditPhone]      = useState("");
    const [editAddress,    setEditAddress]    = useState("");
    const [editLogoUrl,    setEditLogoUrl]    = useState<string | undefined>(undefined);
    const [logoUploading,       setLogoUploading]       = useState(false);
    const [logoUploadSuccess,   setLogoUploadSuccess]   = useState(false);
    const [editSaving,          setEditSaving]          = useState(false);
    const [editError,      setEditError]      = useState<string | null>(null);
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
            name:    editName.trim(),
            phone:   editPhone.trim()   || undefined,
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
        const ext  = file.name.split(".").pop();
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
        downloadCsv(companiesToCsv(filtered), `empresas_${new Date().toISOString().split("T")[0]}.csv`);
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

    const tdCls = "px-4 py-3 border-b border-border-light/60 last:border-b-0";

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="min-h-full bg-surface-2 p-4 sm:p-8 font-mono">
            <div className="max-w-[800px] mx-auto space-y-5">

                {/* Header */}
                <header className="pb-4 border-b border-border-light">
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="font-mono text-[22px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Empresas
                            </h1>
                            <p className="font-mono text-[10px] text-[var(--text-tertiary)] mt-1.5 uppercase tracking-[0.18em]">
                                {capacity?.companies.max !== null && capacity
                                    ? `${capacity.companies.used} / ${capacity.companies.max} empresa${capacity.companies.max !== 1 ? "s" : ""}`
                                    : `${companies.length} empresa${companies.length !== 1 ? "s" : ""}`
                                }
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Export */}
                            <button onClick={handleExport} disabled={filtered.length === 0} className={toolbarBtn}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 1v7M3 6l3 3 3-3M2 10h8" />
                                </svg>
                                Exportar CSV
                            </button>
                            {/* Import file */}
                            <label className={[toolbarBtn, "cursor-pointer", (csvLoading || atCompanyLimit) ? "opacity-40 pointer-events-none" : ""].join(" ")}
                                title={atCompanyLimit ? "Límite de empresas alcanzado" : undefined}>
                                {csvLoading ? <Spinner /> : (
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M6 8V1M3 4l3-3 3 3M2 10h8" />
                                    </svg>
                                )}
                                Importar CSV
                                <input ref={fileInputRef} type="file" accept=".csv" className="sr-only" onChange={handleImportFile} disabled={atCompanyLimit} />
                            </label>
                            {/* Paste CSV */}
                            <button onClick={() => setPasteOpen(true)} disabled={atCompanyLimit}
                                title={atCompanyLimit ? "Límite de empresas alcanzado" : undefined}
                                className={toolbarBtn}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="8" height="8" rx="1" />
                                    <path d="M4 1h4v2H4z" />
                                </svg>
                                Pegar CSV
                            </button>
                            {/* New */}
                            <BaseButton.Root
                                variant="primary"
                                size="sm"
                                onClick={() => { setShowNew(true); setNewRif(""); setNewName(""); setNewError(null); }}
                                isDisabled={showNew || atCompanyLimit}
                                title={atCompanyLimit ? "Límite de empresas alcanzado según tu plan" : undefined}
                                leftIcon={<IconPlus />}
                            >
                                Nueva empresa
                            </BaseButton.Root>
                        </div>
                    </div>
                </header>

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
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="5.5" cy="5.5" r="4" /><path d="M10.5 10.5l-2.5-2.5" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Buscar por nombre o RIF…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className={[
                                    "w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none",
                                    "font-mono text-[14px] text-foreground placeholder:text-[var(--text-disabled)]",
                                    "focus:border-primary-500/50 hover:border-border-medium transition-colors duration-150",
                                ].join(" ")}
                            />
                        </div>

                        <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {["RIF", "Nombre", "Teléfono", "Dirección", "Creada", ""].map((h) => (
                                                <th key={h} className={[
                                                    "px-4 py-2.5 text-left font-mono uppercase text-[var(--text-tertiary)] whitespace-nowrap",
                                                    APP_SIZES.text.tableHeader,
                                                    (h === "Creada" || h === "Teléfono" || h === "Dirección") ? "hidden sm:table-cell" : "",
                                                ].join(" ")}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>

                                        {/* New row */}
                                        {showNew && (
                                            <tr className="bg-primary-500/[0.03] border-b border-border-light/60">
                                                {/* RIF */}
                                                <td className={tdCls + " w-40"}>
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
                                                <td className={tdCls}>
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
                                                            <p className="font-mono text-[9px] text-red-500 mt-1">{newError}</p>
                                                        )}
                                                    </div>
                                                </td>
                                                {/* Teléfono / Dirección — empty on new row */}
                                                <td className={tdCls + " hidden sm:table-cell"}>
                                                    <span className="font-mono text-[10px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className={tdCls + " hidden sm:table-cell"}>
                                                    <span className="font-mono text-[10px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className={tdCls}>
                                                    <span className="font-mono text-[10px] text-[var(--text-disabled)]">—</span>
                                                </td>
                                                <td className={tdCls + " text-right pr-4"}>
                                                    {newSaving ? (
                                                        <div className="flex justify-end"><Spinner /></div>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button onClick={saveNew} title="Guardar"
                                                                className="w-7 h-7 flex items-center justify-center rounded-md text-green-500 hover:bg-green-500/10 transition-colors">
                                                                <IconSave />
                                                            </button>
                                                            <button onClick={cancelNew} title="Cancelar"
                                                                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-foreground/[0.06] transition-colors">
                                                                <IconCancel />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )}

                                        {/* Existing rows */}
                                        {filtered.length === 0 && !showNew ? (
                                            <tr>
                                                <td colSpan={6} className="px-4 py-12 text-center font-mono text-[11px] text-[var(--text-disabled)] uppercase tracking-widest">
                                                    {companies.length === 0
                                                        ? "Sin empresas. Crea una para comenzar."
                                                        : "Sin resultados para la búsqueda."}
                                                </td>
                                            </tr>
                                        ) : (
                                            filtered.map((company) => {
                                                const isEditing = editingId === company.id;
                                                const isConfirm = confirmId === company.id;

                                                return (
                                                    <tr key={company.id} className="transition-colors duration-100 group hover:bg-foreground/[0.02]">

                                                        {/* RIF */}
                                                        <td className={tdCls + " w-40"}>
                                                            <span className="font-mono text-[11px] text-[var(--text-secondary)] uppercase tracking-wider">
                                                                {company.id}
                                                            </span>
                                                        </td>

                                                        {/* Nombre */}
                                                        <td className={tdCls}>
                                                            {isEditing ? (
                                                                <div className="space-y-1.5">
                                                                    <div className="flex items-center gap-2">
                                                                        {/* Logo clickable en modo edición */}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => logoInputRef.current?.click()}
                                                                            disabled={logoUploading}
                                                                            title={logoUploading ? "Subiendo…" : "Cambiar logo"}
                                                                            aria-label={logoUploading ? "Subiendo logo…" : "Cambiar logo de la empresa"}
                                                                            className={[
                                                                                "relative w-7 h-7 rounded-md overflow-hidden bg-primary-500/10 flex items-center justify-center shrink-0",
                                                                                "border transition-colors duration-150 disabled:cursor-not-allowed",
                                                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-1",
                                                                                logoUploadSuccess
                                                                                    ? "border-green-500/60 ring-2 ring-green-500/20"
                                                                                    : "border-border-light hover:border-primary-500/50",
                                                                            ].join(" ")}
                                                                        >
                                                                            {/* Image or initial — kept visible at reduced opacity while uploading */}
                                                                            {editLogoUrl ? (
                                                                                <img
                                                                                    src={editLogoUrl}
                                                                                    alt={`Logo de ${editName || "la empresa"}`}
                                                                                    className={["w-full h-full object-cover transition-opacity duration-150", logoUploading ? "opacity-40" : "opacity-100"].join(" ")}
                                                                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                                                />
                                                                            ) : (
                                                                                <span className={["font-mono text-[9px] font-bold text-primary-500 uppercase transition-opacity duration-150", logoUploading ? "opacity-40" : "opacity-100"].join(" ")}>
                                                                                    {editName[0] ?? "?"}
                                                                                </span>
                                                                            )}
                                                                            {/* Spinner overlay during upload */}
                                                                            {logoUploading && (
                                                                                <span className="absolute inset-0 flex items-center justify-center bg-surface-1/60">
                                                                                    <Spinner />
                                                                                </span>
                                                                            )}
                                                                            {/* Camera icon overlay — always visible, signals the button is interactive */}
                                                                            {!logoUploading && (
                                                                                <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-surface-1 rounded-tl-sm flex items-center justify-center text-primary-500 pointer-events-none">
                                                                                    <IconCamera />
                                                                                </span>
                                                                            )}
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
                                                                    {editError && (
                                                                        <p className="font-mono text-[9px] text-red-500">{editError}</p>
                                                                    )}
                                                                    {/* Phone + Address — visible only on mobile (hidden on sm+ where they have their own columns) */}
                                                                    <div className="sm:hidden space-y-1.5">
                                                                        <input
                                                                            className={cellInput}
                                                                            placeholder="0212-000-0000"
                                                                            value={editPhone}
                                                                            onChange={(e) => setEditPhone(e.target.value)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter") saveEdit();
                                                                                if (e.key === "Escape") cancelEdit();
                                                                            }}
                                                                        />
                                                                        <input
                                                                            className={cellInput}
                                                                            placeholder="Av. Principal, Caracas"
                                                                            value={editAddress}
                                                                            onChange={(e) => setEditAddress(e.target.value)}
                                                                            onKeyDown={(e) => {
                                                                                if (e.key === "Enter") saveEdit();
                                                                                if (e.key === "Escape") cancelEdit();
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <input
                                                                        ref={logoInputRef}
                                                                        type="file"
                                                                        accept="image/jpeg,image/png,image/webp,image/svg+xml"
                                                                        className="sr-only"
                                                                        onChange={handleLogoUpload}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-7 h-7 rounded-md overflow-hidden bg-primary-500/10 flex items-center justify-center shrink-0 border border-border-light/40">
                                                                        {company.logoUrl ? (
                                                                            <img
                                                                                src={company.logoUrl}
                                                                                alt={`Logo de ${company.name}`}
                                                                                className="w-full h-full object-cover"
                                                                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                                                                            />
                                                                        ) : (
                                                                            <span className="font-mono text-[9px] font-bold text-primary-500 uppercase">
                                                                                {company.name[0]}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <span className="font-mono text-[12px] font-medium text-foreground">
                                                                        {company.name}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Teléfono */}
                                                        <td className={tdCls + " hidden sm:table-cell"}>
                                                            {isEditing ? (
                                                                <input
                                                                    className={cellInput}
                                                                    placeholder="0212-000-0000"
                                                                    value={editPhone}
                                                                    onChange={(e) => setEditPhone(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") saveEdit();
                                                                        if (e.key === "Escape") cancelEdit();
                                                                    }}
                                                                />
                                                            ) : (
                                                                <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                                                                    {company.phone ?? "—"}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Dirección */}
                                                        <td className={tdCls + " hidden sm:table-cell"}>
                                                            {isEditing ? (
                                                                <input
                                                                    className={cellInput}
                                                                    placeholder="Av. Principal, Caracas"
                                                                    value={editAddress}
                                                                    onChange={(e) => setEditAddress(e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === "Enter") saveEdit();
                                                                        if (e.key === "Escape") cancelEdit();
                                                                    }}
                                                                />
                                                            ) : (
                                                                <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                                                                    {company.address ?? "—"}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Creada */}
                                                        <td className={tdCls + " hidden sm:table-cell"}>
                                                            <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                                                                {formatDate(company.createdAt)}
                                                            </span>
                                                        </td>

                                                        {/* Actions */}
                                                        <td className={tdCls + " w-36 text-right pr-4"}>
                                                            {isConfirm ? (
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <span className="font-mono text-[9px] text-red-500">¿Eliminar?</span>
                                                                    <button
                                                                        onClick={() => handleDelete(company.id)}
                                                                        disabled={deleting}
                                                                        className="h-6 px-2 rounded-md bg-red-500 text-white font-mono text-[9px] uppercase hover:bg-red-600 disabled:opacity-50 transition-colors"
                                                                    >
                                                                        {deleting ? "…" : "Sí"}
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setConfirmId(null)}
                                                                        className="h-6 px-2 rounded-md border border-border-light font-mono text-[9px] uppercase text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                                                    >
                                                                        No
                                                                    </button>
                                                                </div>
                                                            ) : editSaving && isEditing ? (
                                                                <div className="flex justify-end"><Spinner /></div>
                                                            ) : isEditing ? (
                                                                <div className="flex items-center justify-end gap-1">
                                                                    <button onClick={saveEdit} title="Guardar" aria-label="Guardar cambios"
                                                                        className="w-7 h-7 flex items-center justify-center rounded-md text-green-500 hover:bg-green-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/40 transition-colors">
                                                                        <IconSave />
                                                                    </button>
                                                                    <button onClick={cancelEdit} title="Cancelar" aria-label="Cancelar edición"
                                                                        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-medium transition-colors">
                                                                        <IconCancel />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center justify-end gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                                    <button onClick={() => startEdit(company)} title="Editar" aria-label={`Editar ${company.name}`}
                                                                        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground hover:bg-foreground/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-medium transition-colors">
                                                                        <IconEdit />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => { setConfirmId(company.id); setDeleteError(null); }}
                                                                        title="Eliminar"
                                                                        aria-label={`Eliminar ${company.name}`}
                                                                        className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 transition-colors"
                                                                    >
                                                                        <IconTrash />
                                                                    </button>
                                                                </div>
                                                            )}
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
            {pasteOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm">
                    <div className="w-full sm:max-w-lg bg-surface-1 border border-border-light sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[90dvh] flex flex-col">

                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                            <div>
                                <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.15em] text-foreground">
                                    Pegar CSV
                                </h2>
                                <p className="font-mono text-[9px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-widest">
                                    Empresas · columnas: rif, nombre
                                </p>
                            </div>
                            <button onClick={closePasteModal}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground hover:bg-foreground/[0.06] transition-colors">
                                <IconCancel />
                            </button>
                        </div>

                        {/* Textarea */}
                        <div className="p-5 space-y-3 overflow-y-auto flex-1">
                            <textarea
                                autoFocus
                                rows={10}
                                value={pasteText}
                                onChange={(e) => handlePasteChange(e.target.value)}
                                placeholder={`"rif","nombre"\n"J-12345678-9","Mi Empresa S.A."\n"J-98765432-1","Otra Empresa C.A."`}
                                className={[
                                    "w-full resize-none rounded-lg border bg-surface-2 outline-none p-3",
                                    "font-mono text-[11px] text-foreground leading-relaxed",
                                    "border-border-light focus:border-primary-500/60 hover:border-border-medium",
                                    "transition-colors duration-150 placeholder:text-[var(--text-disabled)]",
                                ].join(" ")}
                            />

                            {/* Validation feedback */}
                            {pasteText.trim() && pasteErrors.length === 0 && pasteCount !== null && (
                                <p className="font-mono text-[10px] text-green-500">
                                    {pasteCount} empresa{pasteCount !== 1 ? "s" : ""} lista{pasteCount !== 1 ? "s" : ""} para importar.
                                </p>
                            )}
                            {pasteErrors.length > 0 && (
                                <div className="space-y-1">
                                    {pasteErrors.slice(0, 3).map((e, i) => (
                                        <p key={i} className="font-mono text-[10px] text-red-500">{e}</p>
                                    ))}
                                    {pasteErrors.length > 3 && (
                                        <p className="font-mono text-[10px] text-[var(--text-tertiary)]">…y {pasteErrors.length - 3} error(es) más.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-light">
                            <button onClick={closePasteModal}
                                className="h-8 px-4 rounded-lg border border-border-light font-mono text-[10px] uppercase tracking-widest text-[var(--text-secondary)] hover:text-foreground hover:border-border-medium transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handlePasteImport}
                                disabled={pasteImporting || pasteErrors.length > 0 || !pasteText.trim() || pasteCount === 0}
                                className={[
                                    "h-8 px-4 rounded-lg font-mono text-[10px] uppercase tracking-widest",
                                    "bg-primary-500 text-white hover:bg-primary-600",
                                    "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
                                    "flex items-center gap-2",
                                ].join(" ")}
                            >
                                {pasteImporting && <Spinner />}
                                {pasteImporting ? "Importando…" : "Importar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
