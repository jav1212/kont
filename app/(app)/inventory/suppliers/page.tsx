"use client";

// Suppliers catalog page — CRUD, CSV import/export, bulk delete.
// Uses English domain types (Supplier) and English useInventory() API.

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Supplier } from "@/src/modules/inventory/backend/domain/supplier";
import {
    suppliersToCsv,
    parseSuppliersCsv,
    downloadCsv,
    type SupplierCsvResult,
} from "@/src/modules/inventory/frontend/utils/inventory-csv";

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

function emptySupplier(companyId: string): Supplier {
    return {
        companyId,
        rif:     "",
        name:    "",
        contact: "",
        phone:   "",
        email:   "",
        address: "",
        notes:   "",
        active:  true,
    };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
    const { companyId } = useCompany();
    const {
        suppliers, loadingSuppliers, error, setError,
        loadSuppliers, saveSupplier, deleteSupplier,
    } = useInventory();

    const [form, setForm] = useState<Supplier | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<SupplierCsvResult | null>(null);
    const [importing, setImporting] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);

    useEffect(() => {
        if (companyId) loadSuppliers(companyId);
    }, [companyId, loadSuppliers]);

    function openNew() {
        if (!companyId) return;
        setForm(emptySupplier(companyId));
        setError(null);
    }

    function openEdit(s: Supplier) {
        setForm({ ...s });
        setError(null);
    }

    function closeForm() { setForm(null); setError(null); }

    async function handleSave() {
        if (!form) return;
        if (!form.name.trim()) { setError("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveSupplier(form);
        setSaving(false);
        if (saved) closeForm();
    }

    async function handleDelete(id: string) {
        await deleteSupplier(id);
        setConfirmDelete(null);
    }

    async function handleBulkDelete() {
        setBulkDeleting(true);
        for (const id of selected) {
            await deleteSupplier(id);
        }
        setBulkDeleting(false);
        setSelected(new Set());
        setConfirmBulkDelete(false);
    }

    const set = (k: keyof Supplier, v: string | boolean) =>
        setForm((f) => f ? { ...f, [k]: v } : f);

    function handleExport() {
        downloadCsv(suppliersToCsv(suppliers), "proveedores.csv");
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = parseSuppliersCsv(ev.target?.result as string);
            setImportResult(result);
        };
        reader.readAsText(file, "utf-8");
        e.target.value = "";
    }

    function handlePasteParse() {
        if (!pasteText.trim()) return;
        const result = parseSuppliersCsv(pasteText);
        setImportResult(result);
        setPasteOpen(false);
        setPasteText("");
    }

    async function handleImport() {
        if (!importResult || !companyId) return;
        setImporting(true);
        for (const s of importResult.suppliers) {
            await saveSupplier({ ...s, companyId });
        }
        setImporting(false);
        setImportResult(null);
        loadSuppliers(companyId);
    }

    const filtered = suppliers.filter(s => [s.rif, s.name, s.contact ?? ""].join(" ").toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Proveedores
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Catálogo de proveedores
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            disabled={suppliers.length === 0}
                            className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-40 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            Exportar CSV
                        </button>
                        <button
                            onClick={() => { setPasteOpen((v) => !v); setError(null); }}
                            className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            Pegar CSV
                        </button>
                        <button
                            onClick={() => fileRef.current?.click()}
                            className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            Importar archivo
                        </button>
                        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                        <button
                            onClick={openNew}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            + Nuevo proveedor
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-8 py-6 space-y-4">
                {/* Search + bulk actions */}
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Buscar…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
                        className="h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-text-tertiary focus:border-primary-500/60 hover:border-border-medium transition-colors w-64"
                    />
                    {selected.size > 0 && (
                        confirmBulkDelete ? (
                            <div className="flex items-center gap-2">
                                <span className="text-[12px] text-foreground">¿Eliminar {selected.size} elemento(s)?</span>
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={bulkDeleting}
                                    className="h-9 px-4 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    {bulkDeleting ? "Eliminando…" : "Confirmar"}
                                </button>
                                <button
                                    onClick={() => setConfirmBulkDelete(false)}
                                    disabled={bulkDeleting}
                                    className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmBulkDelete(true)}
                                className="h-9 px-4 rounded-lg border border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-500 text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Eliminar {selected.size} seleccionado(s)
                            </button>
                        )
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {/* Paste CSV panel */}
                {pasteOpen && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
                            Pegar CSV
                        </p>
                        <p className="text-[10px] text-text-tertiary">
                            Formato esperado — primera fila debe ser el encabezado:
                        </p>
                        <pre className="text-[10px] text-text-secondary bg-surface-2 rounded-lg px-3 py-2 border border-border-light select-all">
{`"rif","nombre","contacto","telefono","email","direccion","notas","activo"
"J-12345678-9","Distribuidora El Sol","Juan Pérez","0414-1234567","info@sol.com","Av. Principal","","true"`}
                        </pre>
                        <textarea
                            className="w-full h-40 px-3 py-2 rounded-lg border border-border-light bg-surface-2 outline-none font-mono text-[11px] text-foreground focus:border-primary-500/60 hover:border-border-medium transition-colors resize-none"
                            placeholder={`"rif","nombre","contacto","telefono","email","direccion","notas","activo"`}
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                        />
                        <div className="flex items-center gap-3 pt-1 border-t border-border-light">
                            <button
                                onClick={handlePasteParse}
                                disabled={!pasteText.trim()}
                                className="h-8 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Procesar
                            </button>
                            <button
                                onClick={() => { setPasteOpen(false); setPasteText(""); }}
                                className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Import preview */}
                {importResult && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground">
                            Vista previa de importación
                        </p>
                        {importResult.errors.length > 0 && (
                            <ul className="space-y-1">
                                {importResult.errors.map((e, i) => (
                                    <li key={i} className="text-[11px] text-red-500">{e}</li>
                                ))}
                            </ul>
                        )}
                        {importResult.suppliers.length > 0 && (
                            <p className="text-[11px] text-[var(--text-secondary)]">
                                {importResult.suppliers.length} proveedor(es) listos para importar.
                            </p>
                        )}
                        <div className="flex items-center gap-3 pt-1 border-t border-border-light">
                            <button
                                onClick={handleImport}
                                disabled={importing || importResult.suppliers.length === 0}
                                className="h-8 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                {importing ? "Importando…" : `Importar ${importResult.suppliers.length}`}
                            </button>
                            <button
                                onClick={() => setImportResult(null)}
                                className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Form panel */}
                {form && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground mb-5">
                            {form.id ? "Editar proveedor" : "Nuevo proveedor"}
                        </h2>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className={labelCls}>RIF</label>
                                <input className={fieldCls} value={form.rif} onChange={(e) => set("rif", e.target.value)} placeholder="J-12345678-9" />
                            </div>
                            <div className="col-span-2">
                                <label className={labelCls}>Nombre *</label>
                                <input className={fieldCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className={labelCls}>Contacto</label>
                                <input className={fieldCls} value={form.contact} onChange={(e) => set("contact", e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Teléfono</label>
                                <input className={fieldCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Email</label>
                                <input className={fieldCls} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className={labelCls}>Dirección</label>
                            <input className={fieldCls} value={form.address} onChange={(e) => set("address", e.target.value)} />
                        </div>

                        <div className="mb-4">
                            <label className={labelCls}>Notas</label>
                            <textarea
                                className={`${fieldCls} h-auto py-2`}
                                rows={2}
                                value={form.notes}
                                onChange={(e) => set("notes", e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-4 mb-5">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox" checked={form.active}
                                    onChange={(e) => set("active", e.target.checked)}
                                    className="w-4 h-4 rounded"
                                />
                                <span className="text-[11px] text-foreground">Activo</span>
                            </label>
                        </div>

                        <div className="flex items-center gap-3 pt-2 border-t border-border-light">
                            <button
                                onClick={handleSave} disabled={saving}
                                className="h-8 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                {saving ? "Guardando…" : "Guardar"}
                            </button>
                            <button
                                onClick={closeForm}
                                className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    {loadingSuppliers ? (
                        <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : suppliers.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">
                            No hay proveedores. Haz clic en &quot;+ Nuevo proveedor&quot; para crear uno.
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[11px] text-text-tertiary">Sin resultados para &quot;{search}&quot;.</div>
                    ) : (
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    <th className="px-4 py-2.5 w-8">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded"
                                            checked={filtered.length > 0 && filtered.every(item => selected.has(item.id!))}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelected(new Set(filtered.map(item => item.id!)));
                                                else setSelected(new Set());
                                            }}
                                        />
                                    </th>
                                    {["RIF", "Nombre", "Contacto", "Teléfono", "Email", "Estado", ""].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((s) => (
                                    <tr key={s.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                        <td className="px-4 py-2.5 w-8">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded"
                                                checked={selected.has(s.id!)}
                                                onChange={(e) => {
                                                    const next = new Set(selected);
                                                    if (e.target.checked) next.add(s.id!);
                                                    else next.delete(s.id!);
                                                    setSelected(next);
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.rif || "—"}</td>
                                        <td className="px-4 py-2.5 text-foreground font-medium">{s.name}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.contact || "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.phone || "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{s.email || "—"}</td>
                                        <td className="px-4 py-2.5">
                                            {s.active
                                                ? <span className="text-text-success text-[9px] uppercase tracking-[0.14em]">Activo</span>
                                                : <span className="text-text-tertiary text-[9px] uppercase tracking-[0.14em]">Inactivo</span>
                                            }
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openEdit(s)}
                                                    className="text-[9px] uppercase tracking-[0.12em] text-primary-500 hover:text-primary-600 transition-colors"
                                                >
                                                    Editar
                                                </button>
                                                {confirmDelete === s.id ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleDelete(s.id!)}
                                                            className="text-[9px] uppercase tracking-[0.12em] text-red-500 hover:text-red-600 transition-colors"
                                                        >
                                                            Confirmar
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDelete(null)}
                                                            className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDelete(s.id!)}
                                                        className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                                                    >
                                                        Eliminar
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
