"use client";

import { useState, useCallback, useRef } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { Company } from "@/src/modules/companies/frontend/hooks/use-companies";
import { companiesToCsv, downloadCsv, parseCompaniesCsv } from "@/src/modules/companies/frontend/utils/company-csv";

// ============================================================================
// CONSTANTS
// ============================================================================

const cellInput = [
    "w-full h-8 px-2.5 rounded-lg border bg-surface-1 outline-none",
    "font-mono text-[12px] text-foreground",
    "border-border-light focus:border-primary-500/60 hover:border-border-medium",
    "transition-colors duration-150 placeholder:text-foreground/25",
].join(" ");

const toolbarBtn = [
    "h-8 px-3 rounded-lg flex items-center gap-1.5 border border-border-light bg-surface-1",
    "hover:border-border-medium hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
    "font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors duration-150",
].join(" ");

// ============================================================================
// ICONS
// ============================================================================

const Spinner = () => (
    <svg className="animate-spin text-foreground/30" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);
const IconSave = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 7l3.5 3.5L11 3" />
    </svg>
);
const IconCancel = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2l9 9M11 2l-9 9" />
    </svg>
);
const IconEdit = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 1.5l2.5 2.5L4 11.5H1.5V9L9 1.5z" />
    </svg>
);
const IconTrash = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5h9M4.5 3.5V2.5h4v1M5 6v4M8 6v4M3 3.5l.5 7h6l.5-7" />
    </svg>
);
const IconPlus = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 1v10M1 6h10" />
    </svg>
);

// ============================================================================
// PAGE
// ============================================================================

export default function CompaniesPage() {
    const { companies, loading, error, save, update, remove, reload } = useCompany();

    // ── Edit state ────────────────────────────────────────────────────────
    const [editingId,   setEditingId]   = useState<string | null>(null);
    const [editName,    setEditName]    = useState("");
    const [editSaving,  setEditSaving]  = useState(false);
    const [editError,   setEditError]   = useState<string | null>(null);

    // ── New row state ──────────────────────────────────────────────────────
    const [showNew,   setShowNew]   = useState(false);
    const [newRif,    setNewRif]    = useState("");
    const [newName,   setNewName]   = useState("");
    const [newSaving, setNewSaving] = useState(false);
    const [newError,  setNewError]  = useState<string | null>(null);

    // ── Delete confirm state ───────────────────────────────────────────────
    const [confirmId,   setConfirmId]   = useState<string | null>(null);
    const [deleting,    setDeleting]    = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // ── CSV state ──────────────────────────────────────────────────────────
    const [csvLoading,  setCsvLoading]  = useState(false);
    const [csvError,    setCsvError]    = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Paste modal state ──────────────────────────────────────────────────
    const [pasteOpen,   setPasteOpen]   = useState(false);
    const [pasteText,   setPasteText]   = useState("");
    const [pasteErrors, setPasteErrors] = useState<string[]>([]);
    const [pasteCount,  setPasteCount]  = useState<number | null>(null);
    const [pasteImporting, setPasteImporting] = useState(false);

    // ── Edit actions ───────────────────────────────────────────────────────

    const startEdit = useCallback((company: Company) => {
        setEditingId(company.id);
        setEditName(company.name);
        setEditError(null);
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditName("");
        setEditError(null);
    }, []);

    const saveEdit = useCallback(async () => {
        if (!editingId || !editName.trim()) return;
        setEditSaving(true);
        setEditError(null);
        const err = await update(editingId, editName.trim());
        setEditSaving(false);
        if (err) { setEditError(err); } else { cancelEdit(); }
    }, [editingId, editName, update, cancelEdit]);

    // ── New actions ────────────────────────────────────────────────────────

    const saveNew = useCallback(async () => {
        if (!newRif.trim())  { setNewError("El RIF es obligatorio"); return; }
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
        if (!companies.length) return;
        downloadCsv(companiesToCsv(companies), `empresas_${new Date().toISOString().split("T")[0]}.csv`);
    }, [companies]);

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
        <div className="min-h-full bg-surface-2 p-8 font-mono">
            <div className="max-w-[800px] mx-auto space-y-5">

                {/* Header */}
                <header className="pb-4 border-b border-border-light">
                    <nav className="text-[10px] uppercase text-foreground/30 mb-1 tracking-widest">
                        Empresas
                    </nav>
                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="text-xl font-bold uppercase tracking-tighter text-foreground">
                                Mis Empresas
                            </h1>
                            <p className="text-[10px] text-foreground/40 mt-0.5 uppercase tracking-widest">
                                {companies.length} empresa{companies.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Export */}
                            <button onClick={handleExport} disabled={companies.length === 0} className={toolbarBtn}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 1v7M3 6l3 3 3-3M2 10h8" />
                                </svg>
                                Exportar CSV
                            </button>
                            {/* Import file */}
                            <label className={[toolbarBtn, "cursor-pointer", csvLoading ? "opacity-40 pointer-events-none" : ""].join(" ")}>
                                {csvLoading ? <Spinner /> : (
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M6 8V1M3 4l3-3 3 3M2 10h8" />
                                    </svg>
                                )}
                                Importar CSV
                                <input ref={fileInputRef} type="file" accept=".csv" className="sr-only" onChange={handleImportFile} />
                            </label>
                            {/* Paste CSV */}
                            <button onClick={() => setPasteOpen(true)} className={toolbarBtn}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="8" height="8" rx="1" />
                                    <path d="M4 1h4v2H4z" />
                                </svg>
                                Pegar CSV
                            </button>
                            {/* New */}
                            <button
                                onClick={() => { setShowNew(true); setNewRif(""); setNewName(""); setNewError(null); }}
                                disabled={showNew}
                                className={[
                                    "h-8 px-3 rounded-lg flex items-center gap-1.5 border",
                                    "bg-primary-500 border-primary-600 text-white",
                                    "hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed",
                                    "font-mono text-[10px] uppercase tracking-[0.18em] transition-colors duration-150",
                                ].join(" ")}
                            >
                                <IconPlus />
                                Nueva empresa
                            </button>
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
                        <span className="font-mono text-[11px] uppercase tracking-widest text-foreground/30">Cargando…</span>
                    </div>
                ) : (
                    <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border-light bg-surface-2">
                                    {["RIF", "Nombre", "Creada", ""].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 whitespace-nowrap">
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
                                        <td className={tdCls}>
                                            <span className="font-mono text-[10px] text-foreground/25">—</span>
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
                                                        className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:bg-foreground/[0.06] transition-colors">
                                                        <IconCancel />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )}

                                {/* Existing rows */}
                                {companies.length === 0 && !showNew ? (
                                    <tr>
                                        <td colSpan={4} className="px-4 py-12 text-center font-mono text-[11px] text-foreground/25 uppercase tracking-widest">
                                            Sin empresas. Crea una para comenzar.
                                        </td>
                                    </tr>
                                ) : (
                                    companies.map((company) => {
                                        const isEditing = editingId === company.id;
                                        const isConfirm = confirmId === company.id;

                                        return (
                                            <tr key={company.id} className="transition-colors duration-100 group hover:bg-foreground/[0.02]">

                                                {/* RIF */}
                                                <td className={tdCls + " w-40"}>
                                                    <span className="font-mono text-[11px] text-foreground/50 uppercase tracking-wider">
                                                        {company.id}
                                                    </span>
                                                </td>

                                                {/* Nombre */}
                                                <td className={tdCls}>
                                                    {isEditing ? (
                                                        <div>
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
                                                            {editError && (
                                                                <p className="font-mono text-[9px] text-red-500 mt-1">{editError}</p>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-md bg-primary-500/10 flex items-center justify-center shrink-0">
                                                                <span className="font-mono text-[9px] font-bold text-primary-500 uppercase">
                                                                    {company.name[0]}
                                                                </span>
                                                            </div>
                                                            <span className="font-mono text-[12px] font-medium text-foreground">
                                                                {company.name}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Creada */}
                                                <td className={tdCls}>
                                                    <span className="font-mono text-[11px] text-foreground/40">
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
                                                                className="h-6 px-2 rounded-md border border-border-light font-mono text-[9px] uppercase text-foreground/40 hover:text-foreground transition-colors"
                                                            >
                                                                No
                                                            </button>
                                                        </div>
                                                    ) : editSaving && isEditing ? (
                                                        <div className="flex justify-end"><Spinner /></div>
                                                    ) : isEditing ? (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button onClick={saveEdit} title="Guardar"
                                                                className="w-7 h-7 flex items-center justify-center rounded-md text-green-500 hover:bg-green-500/10 transition-colors">
                                                                <IconSave />
                                                            </button>
                                                            <button onClick={cancelEdit} title="Cancelar"
                                                                className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:bg-foreground/[0.06] transition-colors">
                                                                <IconCancel />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => startEdit(company)} title="Editar"
                                                                className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:text-foreground hover:bg-foreground/[0.06] transition-colors">
                                                                <IconEdit />
                                                            </button>
                                                            <button
                                                                onClick={() => { setConfirmId(company.id); setDeleteError(null); }}
                                                                title="Eliminar"
                                                                className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:text-red-500 hover:bg-red-500/[0.08] transition-colors"
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
                )}

            </div>

            {/* ── Paste CSV Modal ─────────────────────────────────────────────── */}
            {pasteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden">

                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                            <div>
                                <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.15em] text-foreground">
                                    Pegar CSV
                                </h2>
                                <p className="font-mono text-[9px] text-foreground/35 mt-0.5 uppercase tracking-widest">
                                    Empresas · columnas: rif, nombre
                                </p>
                            </div>
                            <button onClick={closePasteModal}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:text-foreground hover:bg-foreground/[0.06] transition-colors">
                                <IconCancel />
                            </button>
                        </div>

                        {/* Textarea */}
                        <div className="p-5 space-y-3">
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
                                    "transition-colors duration-150 placeholder:text-foreground/20",
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
                                        <p className="font-mono text-[10px] text-foreground/30">…y {pasteErrors.length - 3} error(es) más.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-light">
                            <button onClick={closePasteModal}
                                className="h-8 px-4 rounded-lg border border-border-light font-mono text-[10px] uppercase tracking-widest text-foreground/50 hover:text-foreground hover:border-border-medium transition-colors">
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
