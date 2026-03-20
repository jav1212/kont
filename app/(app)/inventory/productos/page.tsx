"use client";

import { useEffect, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Producto, TipoProducto, UnidadMedida, MetodoValuacion } from "@/src/modules/inventory/backend/domain/producto";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/40 mb-1.5 block";

const TIPOS: { value: TipoProducto; label: string }[] = [
    { value: "mercancia",          label: "Mercancía"         },
    { value: "materia_prima",      label: "Materia Prima"     },
    { value: "producto_terminado", label: "Producto Terminado"},
];

const UNIDADES: { value: UnidadMedida; label: string }[] = [
    { value: "unidad", label: "Unidad" },
    { value: "kg",     label: "Kg"     },
    { value: "g",      label: "g"      },
    { value: "m",      label: "m"      },
    { value: "m2",     label: "m²"     },
    { value: "m3",     label: "m³"     },
    { value: "litro",  label: "Litro"  },
    { value: "caja",   label: "Caja"   },
    { value: "rollo",  label: "Rollo"  },
];

const METODOS: { value: MetodoValuacion; label: string }[] = [
    { value: "promedio_ponderado", label: "Promedio Ponderado" },
    { value: "peps",               label: "PEPS"               },
];

function empty(empresaId: string): Producto {
    return {
        empresaId,
        codigo:          "",
        nombre:          "",
        descripcion:     "",
        tipo:            "mercancia",
        unidadMedida:    "unidad",
        metodoValuacion: "promedio_ponderado",
        existenciaActual: 0,
        existenciaMinima: 0,
        costoPromedio:   0,
        activo:          true,
    };
}

function TipoBadge({ tipo }: { tipo: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        mercancia:          { label: "Mercancía",       cls: "bg-primary-500/10 text-primary-500" },
        materia_prima:      { label: "Mat. Prima",      cls: "bg-amber-500/10 text-amber-600"     },
        producto_terminado: { label: "Prod. Terminado", cls: "bg-green-500/10 text-green-600"     },
    };
    const { label, cls } = map[tipo] ?? { label: tipo, cls: "bg-surface-2 text-foreground/60" };
    return (
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.12em] font-medium ${cls}`}>
            {label}
        </span>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ProductosPage() {
    const { companyId } = useCompany();
    const {
        productos, loadingProductos, error, setError,
        loadProductos, saveProducto, deleteProducto,
    } = useInventory();

    const [form, setForm] = useState<Producto | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    useEffect(() => {
        if (companyId) loadProductos(companyId);
    }, [companyId, loadProductos]);

    function openNew() {
        if (!companyId) return;
        setForm(empty(companyId));
        setError(null);
    }

    function openEdit(p: Producto) {
        setForm({ ...p });
        setError(null);
    }

    function closeForm() { setForm(null); setError(null); }

    async function handleSave() {
        if (!form) return;
        if (!form.nombre.trim()) { setError("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveProducto(form);
        setSaving(false);
        if (saved) closeForm();
    }

    async function handleDelete(id: string) {
        await deleteProducto(id);
        setConfirmDelete(null);
    }

    const set = (k: keyof Producto, v: unknown) =>
        setForm((f) => f ? { ...f, [k]: v } : f);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Productos
                        </h1>
                        <p className="text-[10px] text-foreground/40 uppercase tracking-[0.16em] mt-0.5">
                            Catálogo de productos
                        </p>
                    </div>
                    <button
                        onClick={openNew}
                        className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                    >
                        + Nuevo producto
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
                            {form.id ? "Editar producto" : "Nuevo producto"}
                        </h2>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className={labelCls}>Código</label>
                                <input className={fieldCls} value={form.codigo} onChange={(e) => set("codigo", e.target.value)} />
                            </div>
                            <div className="col-span-2">
                                <label className={labelCls}>Nombre *</label>
                                <input className={fieldCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className={labelCls}>Descripción</label>
                            <input className={fieldCls} value={form.descripcion} onChange={(e) => set("descripcion", e.target.value)} />
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className={labelCls}>Tipo</label>
                                <select className={fieldCls} value={form.tipo} onChange={(e) => set("tipo", e.target.value as TipoProducto)}>
                                    {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Unidad de medida</label>
                                <select className={fieldCls} value={form.unidadMedida} onChange={(e) => set("unidadMedida", e.target.value as UnidadMedida)}>
                                    {UNIDADES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>Método de valuación</label>
                                <select className={fieldCls} value={form.metodoValuacion} onChange={(e) => set("metodoValuacion", e.target.value as MetodoValuacion)}>
                                    {METODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className={labelCls}>Existencia mínima</label>
                                <input
                                    type="number" min="0" step="0.0001" className={fieldCls}
                                    value={form.existenciaMinima}
                                    onChange={(e) => set("existenciaMinima", parseFloat(e.target.value) || 0)}
                                />
                            </div>
                            <div>
                                <label className={labelCls}>Costo promedio</label>
                                <input
                                    type="number" min="0" step="0.0001" className={fieldCls}
                                    value={form.costoPromedio}
                                    onChange={(e) => set("costoPromedio", parseFloat(e.target.value) || 0)}
                                />
                            </div>
                            <div className="flex items-end pb-0.5">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox" checked={form.activo}
                                        onChange={(e) => set("activo", e.target.checked)}
                                        className="w-4 h-4 rounded"
                                    />
                                    <span className="text-[11px] text-foreground">Activo</span>
                                </label>
                            </div>
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
                    {loadingProductos ? (
                        <div className="px-5 py-8 text-center text-[11px] text-foreground/40">Cargando…</div>
                    ) : productos.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[11px] text-foreground/40">
                            No hay productos. Haz clic en "+ Nuevo producto" para crear uno.
                        </div>
                    ) : (
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["Código", "Nombre", "Tipo", "Unidad", "Costo Prom.", "Existencia", "Mínimo", "Estado", ""].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.18em] text-foreground/40 font-normal whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {productos.map((p) => {
                                    const bajoMin = p.activo && p.existenciaActual <= p.existenciaMinima;
                                    return (
                                        <tr key={p.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5 text-foreground/60">{p.codigo || "—"}</td>
                                            <td className="px-4 py-2.5 text-foreground font-medium">{p.nombre}</td>
                                            <td className="px-4 py-2.5"><TipoBadge tipo={p.tipo} /></td>
                                            <td className="px-4 py-2.5 text-foreground/60">{p.unidadMedida}</td>
                                            <td className="px-4 py-2.5 tabular-nums text-foreground/80">{fmtN(p.costoPromedio)}</td>
                                            <td className={`px-4 py-2.5 tabular-nums font-medium ${bajoMin ? "text-amber-500" : "text-foreground"}`}>
                                                {fmtN(p.existenciaActual)}
                                            </td>
                                            <td className="px-4 py-2.5 tabular-nums text-foreground/60">{fmtN(p.existenciaMinima)}</td>
                                            <td className="px-4 py-2.5">
                                                {p.activo
                                                    ? <span className="text-green-500 text-[9px] uppercase tracking-[0.14em]">Activo</span>
                                                    : <span className="text-foreground/40 text-[9px] uppercase tracking-[0.14em]">Inactivo</span>
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
                                                                className="text-[9px] uppercase tracking-[0.12em] text-foreground/40 hover:text-foreground/60 transition-colors"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmDelete(p.id!)}
                                                            className="text-[9px] uppercase tracking-[0.12em] text-foreground/40 hover:text-red-500 transition-colors"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
