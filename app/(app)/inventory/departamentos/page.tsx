"use client";

import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Departamento } from "@/src/modules/inventory/backend/domain/departamento";
import {
    departamentosToCsv,
    parseDepartamentosCsv,
    downloadCsv,
    type DepartamentoCsvResult,
} from "@/src/modules/inventory/frontend/utils/inventory-csv";

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

function empty(empresaId: string): Departamento {
    return { empresaId, nombre: "", descripcion: "", activo: true };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DepartamentosPage() {
    const { companyId } = useCompany();
    const {
        departamentos, loadingDepartamentos, error, setError,
        loadDepartamentos, saveDepartamento, deleteDepartamento,
    } = useInventory();

    const [form, setForm] = useState<Departamento | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<DepartamentoCsvResult | null>(null);
    const [importing, setImporting] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (companyId) loadDepartamentos(companyId);
    }, [companyId, loadDepartamentos]);

    function openNew() {
        if (!companyId) return;
        setForm(empty(companyId));
        setError(null);
    }

    function openEdit(d: Departamento) {
        setForm({ ...d });
        setError(null);
    }

    function closeForm() { setForm(null); setError(null); }

    async function handleSave() {
        if (!form) return;
        if (!form.nombre.trim()) { setError("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveDepartamento(form);
        setSaving(false);
        if (saved) closeForm();
    }

    async function handleDelete(id: string) {
        await deleteDepartamento(id);
        setConfirmDelete(null);
    }

    const set = (k: keyof Departamento, v: unknown) =>
        setForm((f) => f ? { ...f, [k]: v } : f);

    function handleExport() {
        downloadCsv(departamentosToCsv(departamentos), "departamentos.csv");
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = parseDepartamentosCsv(ev.target?.result as string);
            setImportResult(result);
        };
        reader.readAsText(file, "utf-8");
        e.target.value = "";
    }

    async function handleImport() {
        if (!importResult || !companyId) return;
        setImporting(true);
        for (const d of importResult.departamentos) {
            await saveDepartamento({ ...d, empresaId: companyId });
        }
        setImporting(false);
        setImportResult(null);
        loadDepartamentos(companyId);
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Departamentos
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Categorías de productos
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            disabled={departamentos.length === 0}
                            className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-40 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            Exportar CSV
                        </button>
                        <button
                            onClick={() => fileRef.current?.click()}
                            className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            Importar CSV
                        </button>
                        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                        <button
                            onClick={openNew}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            + Nuevo departamento
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-8 py-6 space-y-4">
                {/* Error */}
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
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
                        {importResult.departamentos.length > 0 && (
                            <p className="text-[11px] text-[var(--text-secondary)]">
                                {importResult.departamentos.length} departamento(s) listos para importar.
                            </p>
                        )}
                        <div className="flex items-center gap-3 pt-1 border-t border-border-light">
                            <button
                                onClick={handleImport}
                                disabled={importing || importResult.departamentos.length === 0}
                                className="h-8 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                {importing ? "Importando…" : `Importar ${importResult.departamentos.length}`}
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
                            {form.id ? "Editar departamento" : "Nuevo departamento"}
                        </h2>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className={labelCls}>Nombre *</label>
                                <input
                                    className={fieldCls}
                                    value={form.nombre}
                                    onChange={(e) => set("nombre", e.target.value.toUpperCase())}
                                    placeholder="Ej: PANADERÍA"
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Descripción</label>
                                <input
                                    className={fieldCls}
                                    value={form.descripcion ?? ""}
                                    onChange={(e) => set("descripcion", e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="mb-4 flex items-center gap-2">
                            <input
                                type="checkbox" checked={form.activo}
                                onChange={(e) => set("activo", e.target.checked)}
                                className="w-4 h-4 rounded"
                            />
                            <span className="text-[11px] text-foreground">Activo</span>
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
                    {loadingDepartamentos ? (
                        <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : departamentos.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">
                            No hay departamentos. Haz clic en "+ Nuevo departamento" para crear uno.
                        </div>
                    ) : (
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["Nombre", "Descripción", "Estado", ""].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {departamentos.map((d) => (
                                    <tr key={d.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                        <td className="px-4 py-2.5 text-foreground font-medium">{d.nombre}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{d.descripcion || "—"}</td>
                                        <td className="px-4 py-2.5">
                                            {d.activo
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
                                                        onClick={() => setConfirmDelete(d.id!)}
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
