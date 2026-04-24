"use client";

// Departments catalog page — CRUD, CSV import/export, bulk delete.
// Uses English domain types (Department) and English useInventory() API.

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import type { Department } from "@/src/modules/inventory/backend/domain/department";
import {
    departmentsToCsv,
    parseDepartmentsCsv,
    downloadCsv,
    type DepartmentCsvResult,
} from "@/src/modules/inventory/frontend/utils/inventory-csv";

// ── helpers ──────────────────────────────────────────────────────────────────

function emptyDepartment(companyId: string): Department {
    return { companyId, name: "", description: "", active: true };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DepartamentosPage() {
    const { companyId } = useCompany();
    const {
        departments, loadingDepartments, error, setError,
        loadDepartments, saveDepartment, deleteDepartment,
    } = useInventory();

    const [form, setForm] = useState<Department | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<DepartmentCsvResult | null>(null);
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
        if (companyId) loadDepartments(companyId);
    }, [companyId, loadDepartments]);

    function openNew() {
        if (!companyId) return;
        setForm(emptyDepartment(companyId));
        setError(null);
    }

    function openEdit(d: Department) {
        setForm({ ...d });
        setError(null);
    }

    function closeForm() { setForm(null); setError(null); }

    async function handleSave() {
        if (!form) return;
        if (!form.name.trim()) { setError("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveDepartment(form);
        setSaving(false);
        if (saved) closeForm();
    }

    async function handleDelete(id: string) {
        setDeletingId(id);
        await deleteDepartment(id);
        setDeletingId(null);
        setConfirmDelete(null);
    }

    async function handleBulkDelete() {
        setBulkDeleting(true);
        for (const id of selected) {
            await deleteDepartment(id);
        }
        setBulkDeleting(false);
        setSelected(new Set());
        setConfirmBulkDelete(false);
    }

    const set = (k: keyof Department, v: string | boolean) =>
        setForm((f) => f ? { ...f, [k]: v } : f);

    function handleExport() {
        downloadCsv(departmentsToCsv(departments), "departamentos.csv");
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = parseDepartmentsCsv(ev.target?.result as string);
            setImportResult(result);
        };
        reader.readAsText(file, "utf-8");
        e.target.value = "";
    }

    function handlePasteParse() {
        if (!pasteText.trim()) return;
        const result = parseDepartmentsCsv(pasteText);
        setImportResult(result);
        setPasteOpen(false);
        setPasteText("");
    }

    async function handleImport() {
        if (!importResult || !companyId) return;
        setImporting(true);
        for (const d of importResult.departments) {
            await saveDepartment({ ...d, companyId });
        }
        setImporting(false);
        setImportResult(null);
        loadDepartments(companyId);
    }

    const filtered = departments.filter(d => [d.name, d.description ?? ""].join(" ").toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Departamentos" subtitle="Categorías de productos">
                <BaseButton.Root variant="secondary" size="sm" onClick={handleExport} isDisabled={departments.length === 0}>
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
                    + Nuevo departamento
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
{`"nombre","descripcion","activo"
"PANADERÍA","Productos de panadería","true"
"LÁCTEOS","","true"`}
                        </pre>
                        <textarea
                            className="w-full h-40 px-3 py-2 rounded-lg border border-border-light bg-surface-2 outline-none font-mono text-[11px] text-foreground focus:border-primary-500/60 hover:border-border-medium transition-colors resize-none"
                            placeholder={"\"nombre\",\"descripcion\",\"activo\"\n\"PANADERÍA\",\"\",\"true\""}
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
                        {importResult.departments.length > 0 && (
                            <p className="text-[11px] text-[var(--text-secondary)]">
                                {importResult.departments.length} departamento(s) listos para importar.
                            </p>
                        )}
                        <div className="flex items-center gap-3 pt-1 border-t border-border-light">
                            <BaseButton.Root variant="primary" size="sm" onClick={handleImport} isDisabled={importing || importResult.departments.length === 0} loading={importing}>
                                {importing ? "Importando…" : `Importar ${importResult.departments.length}`}
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
                            {form.id ? "Editar departamento" : "Nuevo departamento"}
                        </h2>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <BaseInput.Field
                                label="Nombre *"
                                type="text"
                                value={form.name}
                                onValueChange={(v) => set("name", v.toUpperCase())}
                                placeholder="Ej: PANADERÍA"
                            />
                            <BaseInput.Field
                                label="Descripción"
                                type="text"
                                value={form.description ?? ""}
                                onValueChange={(v) => set("description", v)}
                            />
                        </div>

                        <div className="mb-4">
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
                    {loadingDepartments ? (
                        <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : departments.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">
                            No hay departamentos. Haz clic en &quot;+ Nuevo departamento&quot; para crear uno.
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
                                    {["Nombre", "Descripción", "Estado", ""].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((d) => (
                                    <tr key={d.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                        <td className="px-4 py-2.5 w-8">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded"
                                                checked={selected.has(d.id!)}
                                                onChange={(e) => {
                                                    const next = new Set(selected);
                                                    if (e.target.checked) next.add(d.id!);
                                                    else next.delete(d.id!);
                                                    setSelected(next);
                                                }}
                                            />
                                        </td>
                                        <td className="px-4 py-2.5 text-foreground font-medium">{d.name}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{d.description || "—"}</td>
                                        <td className="px-4 py-2.5">
                                            {d.active
                                                ? <span className="text-text-success text-[9px] uppercase tracking-[0.14em]">Activo</span>
                                                : <span className="text-text-tertiary text-[9px] uppercase tracking-[0.14em]">Inactivo</span>
                                            }
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openEdit(d)}
                                                    className="text-[9px] uppercase tracking-[0.12em] text-primary-500 hover:text-primary-600 transition-colors"
                                                >
                                                    Editar
                                                </button>
                                                {confirmDelete === d.id ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleDelete(d.id!)}
                                                            disabled={deletingId === d.id}
                                                            className="text-[9px] uppercase tracking-[0.12em] text-red-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            {deletingId === d.id ? "Eliminando…" : "Confirmar"}
                                                        </button>
                                                        <button
                                                            onClick={() => setConfirmDelete(null)}
                                                            disabled={deletingId === d.id}
                                                            className="text-[9px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        >
                                                            Cancelar
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => setConfirmDelete(d.id!)}
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
