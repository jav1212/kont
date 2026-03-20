"use client";

import { useEffect, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Proveedor } from "@/src/modules/inventory/backend/domain/proveedor";

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

function emptyProveedor(empresaId: string): Proveedor {
    return {
        empresaId,
        rif:       "",
        nombre:    "",
        contacto:  "",
        telefono:  "",
        email:     "",
        direccion: "",
        notas:     "",
        activo:    true,
    };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
    const { companyId } = useCompany();
    const {
        proveedores, loadingProveedores, error, setError,
        loadProveedores, saveProveedor, deleteProveedor,
    } = useInventory();

    const [form, setForm] = useState<Proveedor | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    useEffect(() => {
        if (companyId) loadProveedores(companyId);
    }, [companyId, loadProveedores]);

    function openNew() {
        if (!companyId) return;
        setForm(emptyProveedor(companyId));
        setError(null);
    }

    function openEdit(p: Proveedor) {
        setForm({ ...p });
        setError(null);
    }

    function closeForm() { setForm(null); setError(null); }

    async function handleSave() {
        if (!form) return;
        if (!form.nombre.trim()) { setError("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveProveedor(form);
        setSaving(false);
        if (saved) closeForm();
    }

    async function handleDelete(id: string) {
        await deleteProveedor(id);
        setConfirmDelete(null);
    }

    const set = (k: keyof Proveedor, v: unknown) =>
        setForm((f) => f ? { ...f, [k]: v } : f);

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
                    <button
                        onClick={openNew}
                        className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                    >
                        + Nuevo proveedor
                    </button>
                </div>
            </div>

            <div className="px-8 py-6 space-y-4">
                {/* Error */}
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
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
                                <input className={fieldCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className={labelCls}>Contacto</label>
                                <input className={fieldCls} value={form.contacto} onChange={(e) => set("contacto", e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Teléfono</label>
                                <input className={fieldCls} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Email</label>
                                <input className={fieldCls} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className={labelCls}>Dirección</label>
                            <input className={fieldCls} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} />
                        </div>

                        <div className="mb-4">
                            <label className={labelCls}>Notas</label>
                            <textarea
                                className={`${fieldCls} h-auto py-2`}
                                rows={2}
                                value={form.notas}
                                onChange={(e) => set("notas", e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-4 mb-5">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox" checked={form.activo}
                                    onChange={(e) => set("activo", e.target.checked)}
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
                    {loadingProveedores ? (
                        <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : proveedores.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[11px] text-[var(--text-tertiary)]">
                            No hay proveedores. Haz clic en &quot;+ Nuevo proveedor&quot; para crear uno.
                        </div>
                    ) : (
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["RIF", "Nombre", "Contacto", "Teléfono", "Email", "Estado", ""].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {proveedores.map((p) => (
                                    <tr key={p.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.rif || "—"}</td>
                                        <td className="px-4 py-2.5 text-foreground font-medium">{p.nombre}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.contacto || "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.telefono || "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.email || "—"}</td>
                                        <td className="px-4 py-2.5">
                                            {p.activo
                                                ? <span className="text-text-success text-[9px] uppercase tracking-[0.14em]">Activo</span>
                                                : <span className="text-text-tertiary text-[9px] uppercase tracking-[0.14em]">Inactivo</span>
                                            }
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openEdit(p)}
                                                    className="text-[9px] uppercase tracking-[0.12em] text-primary-500 hover:text-primary-600 transition-colors"
                                                >
                                                    Editar
                                                </button>
                                                {confirmDelete === p.id ? (
                                                    <>
                                                        <button
                                                            onClick={() => handleDelete(p.id!)}
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
                                                        onClick={() => setConfirmDelete(p.id!)}
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
