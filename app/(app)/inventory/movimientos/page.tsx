"use client";

import { useEffect, useState, useMemo } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Movimiento, TipoMovimiento } from "@/src/modules/inventory/backend/domain/movimiento";

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

const TIPO_GROUPS = [
    {
        label: "Entradas",
        items: [
            { value: "entrada_compra",    label: "Entrada compra"     },
            { value: "entrada_produccion", label: "Entrada producción" },
            { value: "devolucion_compra", label: "Devolución compra"  },
        ],
    },
    {
        label: "Salidas",
        items: [
            { value: "salida_venta",       label: "Salida venta"        },
            { value: "salida_produccion",  label: "Salida producción"   },
            { value: "devolucion_venta",   label: "Devolución venta"    },
        ],
    },
    {
        label: "Ajustes",
        items: [
            { value: "ajuste_positivo", label: "Ajuste positivo" },
            { value: "ajuste_negativo", label: "Ajuste negativo" },
        ],
    },
];

function tipoBadgeClass(tipo: TipoMovimiento): string {
    if (["entrada_compra","entrada_produccion","devolucion_venta"].includes(tipo))
        return "bg-green-500/10 text-green-600";
    if (["salida_venta","salida_produccion","devolucion_compra"].includes(tipo))
        return "bg-red-500/10 text-red-500";
    if (tipo === "ajuste_positivo") return "bg-amber-500/10 text-amber-600";
    return "bg-orange-500/10 text-orange-600";
}

function tipoLabel(tipo: TipoMovimiento) {
    const all = TIPO_GROUPS.flatMap((g) => g.items);
    return all.find((i) => i.value === tipo)?.label ?? tipo;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MovimientosPage() {
    const { companyId } = useCompany();
    const {
        productos, movimientos,
        loadingProductos, loadingMovimientos, saving: _s, error, setError,
        loadProductos, loadMovimientos, saveMovimiento,
    } = useInventory() as ReturnType<typeof useInventory> & { saving?: boolean };

    const [periodo, setPeriodo] = useState(currentPeriod());
    const [saving, setSaving] = useState(false);

    const emptyForm = (): Omit<Movimiento, "saldoCantidad" | "costoTotal" | "periodo"> & { saldoCantidad: number; costoTotal: number; periodo: string } => ({
        empresaId:    companyId ?? "",
        productoId:   "",
        tipo:         "entrada_compra" as TipoMovimiento,
        fecha:        isoToday(),
        periodo:      currentPeriod(),
        cantidad:     0,
        costoUnitario: 0,
        costoTotal:   0,
        saldoCantidad: 0,
        referencia:   "",
        notas:        "",
    });

    const [form, setForm] = useState(emptyForm());

    useEffect(() => {
        if (!companyId) return;
        loadProductos(companyId);
        loadMovimientos(companyId, periodo);
    }, [companyId, loadProductos, loadMovimientos, periodo]);

    // Pre-fill costo unitario when producto changes
    useEffect(() => {
        if (!form.productoId) return;
        const p = productos.find((x) => x.id === form.productoId);
        if (p) setForm((f) => ({ ...f, costoUnitario: p.costoPromedio, empresaId: companyId ?? "" }));
    }, [form.productoId, productos, companyId]);

    const costoTotal = useMemo(() =>
        form.cantidad * form.costoUnitario,
    [form.cantidad, form.costoUnitario]);

    function setF<K extends keyof typeof form>(k: K, v: typeof form[K]) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    async function handleSave() {
        if (!form.productoId) { setError("Selecciona un producto"); return; }
        if (!form.cantidad || form.cantidad <= 0) { setError("La cantidad debe ser mayor a 0"); return; }
        setSaving(true);
        const mov: Movimiento = {
            ...form,
            empresaId:    companyId!,
            costoTotal,
            saldoCantidad: 0, // server calculates
            periodo:      form.fecha.slice(0, 7),
        };
        const saved = await saveMovimiento(mov);
        setSaving(false);
        if (saved) {
            setForm(emptyForm());
            loadMovimientos(companyId!, periodo);
        }
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                    Movimientos
                </h1>
                <p className="text-[10px] text-foreground/40 uppercase tracking-[0.16em] mt-0.5">
                    Registro de entradas, salidas y ajustes
                </p>
            </div>

            <div className="px-8 py-6 grid grid-cols-5 gap-6">
                {/* Left: form */}
                <div className="col-span-2 space-y-4">
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground mb-4">
                            Nuevo movimiento
                        </h2>

                        {error && (
                            <div className="mb-4 px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                                {error}
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label className={labelCls}>Producto *</label>
                                <select
                                    className={fieldCls}
                                    value={form.productoId}
                                    onChange={(e) => setF("productoId", e.target.value)}
                                >
                                    <option value="">Seleccionar…</option>
                                    {productos.filter((p) => p.activo).map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.codigo ? `[${p.codigo}] ` : ""}{p.nombre}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className={labelCls}>Tipo *</label>
                                <select
                                    className={fieldCls}
                                    value={form.tipo}
                                    onChange={(e) => setF("tipo", e.target.value as TipoMovimiento)}
                                >
                                    {TIPO_GROUPS.map((g) => (
                                        <optgroup key={g.label} label={g.label}>
                                            {g.items.map((i) => (
                                                <option key={i.value} value={i.value}>{i.label}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className={labelCls}>Fecha</label>
                                <input
                                    type="date" className={fieldCls}
                                    value={form.fecha}
                                    onChange={(e) => setF("fecha", e.target.value)}
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Cantidad *</label>
                                <input
                                    type="number" min="0.0001" step="0.0001" className={fieldCls}
                                    value={form.cantidad || ""}
                                    onChange={(e) => setF("cantidad", parseFloat(e.target.value) || 0)}
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Costo unitario</label>
                                <input
                                    type="number" min="0" step="0.0001" className={fieldCls}
                                    value={form.costoUnitario || ""}
                                    onChange={(e) => setF("costoUnitario", parseFloat(e.target.value) || 0)}
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Costo total (calculado)</label>
                                <input
                                    readOnly className={fieldCls + " cursor-default opacity-70"}
                                    value={fmtN(costoTotal)}
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Referencia</label>
                                <input
                                    className={fieldCls}
                                    value={form.referencia}
                                    onChange={(e) => setF("referencia", e.target.value)}
                                    placeholder="Nro. factura, orden, etc."
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                <input
                                    className={fieldCls}
                                    value={form.notas}
                                    onChange={(e) => setF("notas", e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-border-light">
                            <button
                                onClick={handleSave} disabled={saving}
                                className="w-full h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                {saving ? "Registrando…" : "Registrar movimiento"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: history */}
                <div className="col-span-3">
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                                Historial
                            </p>
                            <div className="flex items-center gap-2">
                                <label className="text-[9px] uppercase tracking-[0.16em] text-foreground/40">Período</label>
                                <input
                                    type="month" className="h-7 px-2 rounded border border-border-light bg-surface-2 text-[11px] text-foreground outline-none"
                                    value={periodo}
                                    onChange={(e) => setPeriodo(e.target.value)}
                                />
                            </div>
                        </div>

                        {loadingMovimientos ? (
                            <div className="px-5 py-8 text-center text-[11px] text-foreground/40">Cargando…</div>
                        ) : movimientos.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[11px] text-foreground/40">
                                No hay movimientos para este período.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {["Fecha", "Producto", "Tipo", "Cantidad", "Costo U.", "Costo Total", "Referencia"].map((h) => (
                                                <th key={h} className="px-3 py-2.5 text-left text-[9px] uppercase tracking-[0.16em] text-foreground/40 font-normal whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movimientos.map((m) => {
                                            const prod = productos.find((p) => p.id === m.productoId);
                                            return (
                                                <tr key={m.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                    <td className="px-3 py-2.5 text-foreground/60 whitespace-nowrap">{m.fecha}</td>
                                                    <td className="px-3 py-2.5 text-foreground max-w-[120px] truncate">
                                                        {prod?.nombre ?? m.productoId}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.10em] font-medium ${tipoBadgeClass(m.tipo as TipoMovimiento)}`}>
                                                            {tipoLabel(m.tipo as TipoMovimiento)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.cantidad)}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground/70">{fmtN(m.costoUnitario)}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.costoTotal)}</td>
                                                    <td className="px-3 py-2.5 text-foreground/60 max-w-[100px] truncate">{m.referencia || "—"}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
