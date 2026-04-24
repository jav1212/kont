"use client";

// Suppliers catalog page — CRUD, CSV import/export, bulk delete.
// Uses English domain types (Supplier) and English useInventory() API.

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
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
    const [deletingId, setDeletingId] = useState<string | null>(null);

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
        setDeletingId(id);
        await deleteSupplier(id);
        setDeletingId(null);
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
            <PageHeader title="Proveedores" subtitle="Catálogo de proveedores">
                <BaseButton.Root variant="secondary" size="sm" onClick={handleExport} isDisabled={suppliers.length === 0}>
                    Exportar CSV
                </BaseButton.Root>
                <BaseButton.Root variant="secondary" size="sm" onClick={() => { setPasteOpen((v) => !v); setError(null); }}>
                    Pegar CSV
                </BaseButton.Root>
                <BaseButton.Root variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                    Importar archivo
                </BaseButton.Root>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                <BaseButton.Root variant="primary" size="sm" onClick={openNew}>
                    + Nuevo proveedor
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-4">
                {/* Search + bulk actions */}
                <div className="flex items-center gap-3">
                    <BaseInput.Field
                        type="text"
                        placeholder="Buscar…"
                        value={search}
                        onValueChange={(v) => { setSearch(v); setSelected(new Set()); }}
                        className="w-64"
                    />
                    {selected.size > 0 && (
                        confirmBulkDelete ? (
                            <div className="flex items-center gap-2">
                                <span className="text-[12px] text-foreground">¿Eliminar {selected.size} elemento(s)?</span>
                                <BaseButton.Root variant="danger" size="md" onClick={handleBulkDelete} isDisabled={bulkDeleting} loading={bulkDeleting}>
                                    {bulkDeleting ? "Eliminando…" : "Confirmar"}
                                </BaseButton.Root>
                                <BaseButton.Root variant="secondary" size="md" onClick={() => setConfirmBulkDelete(false)} isDisabled={bulkDeleting}>
                                    Cancelar
                                </BaseButton.Root>
                            </div>
                        ) : (
                            <BaseButton.Root variant="dangerOutline" size="md" onClick={() => setConfirmBulkDelete(true)}>
                                Eliminar {selected.size} seleccionado(s)
                            </BaseButton.Root>
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
                            <BaseButton.Root variant="primary" size="sm" onClick={handlePasteParse} isDisabled={!pasteText.trim()}>
                                Procesar
                            </BaseButton.Root>
                            <BaseButton.Root variant="secondary" size="sm" onClick={() => { setPasteOpen(false); setPasteText(""); }}>
                                Cancelar
                            </BaseButton.Root>
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
                            <BaseButton.Root variant="primary" size="sm" onClick={handleImport} isDisabled={importing || importResult.suppliers.length === 0} loading={importing}>
                                {importing ? "Importando…" : `Importar ${importResult.suppliers.length}`}
                            </BaseButton.Root>
                            <BaseButton.Root variant="secondary" size="sm" onClick={() => setImportResult(null)}>
                                Cancelar
                            </BaseButton.Root>
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
                            <BaseInput.Field
                                label="RIF"
                                type="text"
                                value={form.rif}
                                onValueChange={(v) => set("rif", v)}
                                placeholder="J-12345678-9"
                            />
                            <BaseInput.Field
                                label="Nombre *"
                                type="text"
                                value={form.name}
                                onValueChange={(v) => set("name", v)}
                                className="col-span-2"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <BaseInput.Field
                                label="Contacto"
                                type="text"
                                value={form.contact}
                                onValueChange={(v) => set("contact", v)}
                            />
                            <BaseInput.Field
                                label="Teléfono"
                                type="text"
                                value={form.phone}
                                onValueChange={(v) => set("phone", v)}
                            />
                            <BaseInput.Field
                                label="Email"
                                type="email"
                                value={form.email}
                                onValueChange={(v) => set("email", v)}
                            />
                        </div>

                        <div className="mb-4">
                            <BaseInput.Field
                                label="Dirección"
                                type="text"
                                value={form.address}
                                onValueChange={(v) => set("address", v)}
                            />
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
                            <BaseButton.Root variant="primary" size="sm" onClick={handleSave} isDisabled={saving} loading={saving}>
                                {saving ? "Guardando…" : "Guardar"}
                            </BaseButton.Root>
                            <BaseButton.Root variant="secondary" size="sm" onClick={closeForm}>
                                Cancelar
                            </BaseButton.Root>
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
                                                            disabled={deletingId === s.id}
                                                            className="text-[9px] uppercase tracking-[0.12em] text-red-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {deletingId === s.id ? "Eliminando…" : "Confirmar"}
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDelete(null)}
                                                            disabled={deletingId === s.id}
                                                            className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDelete(s.id!)}
                                                        disabled={!!deletingId}
                                                        className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-red-500 transition-colors disabled:opacity-50"
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
