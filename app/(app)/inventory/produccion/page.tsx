"use client";

import { useEffect, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Transformacion, TransformacionConsumo } from "@/src/modules/inventory/backend/domain/transformacion";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function isoToday() { return new Date().toISOString().split("T")[0]; }
function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-foreground/40 mb-1.5 block";

// ── component ─────────────────────────────────────────────────────────────────

export default function ProduccionPage() {
    const { companyId } = useCompany();
    const {
        productos, transformaciones,
        loadingProductos, loadingTransformaciones, error, setError,
        loadProductos, loadTransformaciones, saveTransformacion,
    } = useInventory();

    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState<Omit<Transformacion, "id" | "createdAt">>({
        empresaId:          "",
        descripcion:        "",
        fecha:              isoToday(),
        periodo:            currentPeriod(),
        productoTerminadoId: null,
        cantidadProducida:  0,
        notas:              "",
        consumos:           [],
    });

    const [consumos, setConsumos] = useState<TransformacionConsumo[]>([
        { productoId: "", cantidad: 0, costoUnitario: 0 },
    ]);

    useEffect(() => {
        if (!companyId) return;
        loadProductos(companyId);
        loadTransformaciones(companyId);
    }, [companyId, loadProductos, loadTransformaciones]);

    const materiasPrimas = productos.filter((p) => p.activo && p.tipo === "materia_prima");
    const productosTerminados = productos.filter((p) => p.activo && p.tipo === "producto_terminado");

    const costoLote = consumos.reduce((s, c) => s + (c.cantidad * c.costoUnitario), 0);

    function setF<K extends keyof typeof form>(k: K, v: typeof form[K]) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    function addConsumo() {
        setConsumos((c) => [...c, { productoId: "", cantidad: 0, costoUnitario: 0 }]);
    }

    function removeConsumo(idx: number) {
        setConsumos((c) => c.filter((_, i) => i !== idx));
    }

    function setConsumo(idx: number, k: keyof TransformacionConsumo, v: string | number) {
        setConsumos((cs) =>
            cs.map((c, i) => {
                if (i !== idx) return c;
                const updated = { ...c, [k]: v };
                // Auto-fill costo unitario from product
                if (k === "productoId") {
                    const p = productos.find((x) => x.id === v);
                    if (p) updated.costoUnitario = p.costoPromedio;
                }
                return updated;
            })
        );
    }

    async function handleSave() {
        if (!companyId) return;
        if (!form.descripcion.trim()) { setError("La descripción es requerida"); return; }
        setSaving(true);
        const transformacion: Transformacion = {
            ...form,
            empresaId:  companyId,
            periodo:    form.fecha.slice(0, 7),
            consumos:   consumos.filter((c) => c.productoId && c.cantidad > 0),
        };
        const saved = await saveTransformacion(transformacion);
        setSaving(false);
        if (saved) {
            setForm({
                empresaId:          companyId,
                descripcion:        "",
                fecha:              isoToday(),
                periodo:            currentPeriod(),
                productoTerminadoId: null,
                cantidadProducida:  0,
                notas:              "",
                consumos:           [],
            });
            setConsumos([{ productoId: "", cantidad: 0, costoUnitario: 0 }]);
            loadProductos(companyId); // refresh stock
        }
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                    Producción
                </h1>
                <p className="text-[10px] text-foreground/40 uppercase tracking-[0.16em] mt-0.5">
                    Lotes de transformación y producción
                </p>
            </div>

            <div className="px-8 py-6 grid grid-cols-5 gap-6">
                {/* Left: form */}
                <div className="col-span-2 space-y-4">
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground mb-4">
                            Nuevo lote
                        </h2>

                        {error && (
                            <div className="mb-4 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                                {error}
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className={labelCls}>Descripción *</label>
                                <input className={fieldCls} value={form.descripcion} onChange={(e) => setF("descripcion", e.target.value)} placeholder="Ej: Lote producción 001" />
                            </div>

                            <div>
                                <label className={labelCls}>Fecha</label>
                                <input type="date" className={fieldCls} value={form.fecha} onChange={(e) => setF("fecha", e.target.value)} />
                            </div>

                            <div>
                                <label className={labelCls}>Producto terminado</label>
                                <select className={fieldCls} value={form.productoTerminadoId ?? ""} onChange={(e) => setF("productoTerminadoId", e.target.value || null)}>
                                    <option value="">— ninguno —</option>
                                    {productosTerminados.map((p) => (
                                        <option key={p.id} value={p.id}>{p.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className={labelCls}>Cantidad producida</label>
                                <input
                                    type="number" min="0" step="0.0001" className={fieldCls}
                                    value={form.cantidadProducida || ""}
                                    onChange={(e) => setF("cantidadProducida", parseFloat(e.target.value) || 0)}
                                />
                            </div>

                            {/* Consumos */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className={labelCls + " mb-0"}>Consumos de materias primas</label>
                                    <button onClick={addConsumo} className="text-[9px] uppercase tracking-[0.12em] text-primary-500 hover:text-primary-600 transition-colors">
                                        + Agregar
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {consumos.map((c, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <select
                                                className="flex-1 h-8 px-2 rounded border border-border-light bg-surface-1 text-[11px] text-foreground outline-none"
                                                value={c.productoId}
                                                onChange={(e) => setConsumo(idx, "productoId", e.target.value)}
                                            >
                                                <option value="">Materia prima…</option>
                                                {materiasPrimas.map((p) => (
                                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                                ))}
                                                {/* Also allow any active product */}
                                                {productos.filter((p) => p.activo && p.tipo !== "materia_prima").map((p) => (
                                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                                ))}
                                            </select>
                                            <input
                                                type="number" min="0.0001" step="0.0001" placeholder="Cant."
                                                className="w-20 h-8 px-2 rounded border border-border-light bg-surface-1 text-[11px] text-foreground tabular-nums outline-none"
                                                value={c.cantidad || ""}
                                                onChange={(e) => setConsumo(idx, "cantidad", parseFloat(e.target.value) || 0)}
                                            />
                                            <input
                                                type="number" min="0" step="0.0001" placeholder="Costo U."
                                                className="w-24 h-8 px-2 rounded border border-border-light bg-surface-1 text-[11px] text-foreground tabular-nums outline-none"
                                                value={c.costoUnitario || ""}
                                                onChange={(e) => setConsumo(idx, "costoUnitario", parseFloat(e.target.value) || 0)}
                                            />
                                            <button onClick={() => removeConsumo(idx)} className="text-foreground/30 hover:text-red-500 transition-colors text-[13px]">
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Costo total lote */}
                            <div className="pt-2 border-t border-border-light">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] uppercase tracking-[0.16em] text-foreground/40">Costo total del lote</span>
                                    <span className="text-[14px] font-bold tabular-nums text-foreground">{fmtN(costoLote)}</span>
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                <input className={fieldCls} value={form.notas} onChange={(e) => setF("notas", e.target.value)} />
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-border-light">
                            <button
                                onClick={handleSave} disabled={saving}
                                className="w-full h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                {saving ? "Procesando…" : "Registrar lote"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: transformaciones list */}
                <div className="col-span-3">
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Lotes registrados
                            </p>
                        </div>

                        {loadingTransformaciones ? (
                            <div className="px-5 py-8 text-center text-[11px] text-foreground/40">Cargando…</div>
                        ) : transformaciones.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[11px] text-foreground/40">
                                No hay lotes registrados.
                            </div>
                        ) : (
                            <table className="w-full text-[11px]">
                                <thead>
                                    <tr className="border-b border-border-light">
                                        {["Fecha","Descripción","Prod. Terminado","Cant. Producida","Período","Notas"].map((h) => (
                                            <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-foreground/40 font-normal whitespace-nowrap">
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {transformaciones.map((t) => {
                                        const prod = productos.find((p) => p.id === t.productoTerminadoId);
                                        return (
                                            <tr key={t.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                <td className="px-4 py-2.5 text-foreground/60 whitespace-nowrap">{t.fecha}</td>
                                                <td className="px-4 py-2.5 text-foreground font-medium">{t.descripcion}</td>
                                                <td className="px-4 py-2.5 text-foreground/70">{prod?.nombre ?? "—"}</td>
                                                <td className="px-4 py-2.5 tabular-nums text-foreground">{fmtN(t.cantidadProducida)}</td>
                                                <td className="px-4 py-2.5 text-foreground/60">{t.periodo}</td>
                                                <td className="px-4 py-2.5 text-foreground/50 max-w-[120px] truncate">{t.notas || "—"}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
