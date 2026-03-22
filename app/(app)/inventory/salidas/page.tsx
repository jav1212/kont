"use client";

import { useEffect, useState, useMemo } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function isoToday() { return new Date().toISOString().split("T")[0]; }
function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

interface LineItem {
    productoId: string;
    cantidad: number;
}

function emptyLine(): LineItem {
    return { productoId: "", cantidad: 0 };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function VentasPage() {
    const { companyId } = useCompany();
    const {
        productos, movimientos,
        loadingMovimientos, error, setError,
        loadProductos, loadMovimientos, saveVenta,
    } = useInventory();

    const [periodo, setPeriodo] = useState(currentPeriod());
    const [saving, setSaving] = useState(false);

    const [fecha, setFecha]         = useState(isoToday());
    const [referencia, setReferencia] = useState("");
    const [lines, setLines]         = useState<LineItem[]>([emptyLine()]);

    useEffect(() => {
        if (!companyId) return;
        loadProductos(companyId);
        loadMovimientos(companyId, periodo);
    }, [companyId, loadProductos, loadMovimientos, periodo]);

    // ── line helpers ─────────────────────────────────────────────────────────

    function updateLine<K extends keyof LineItem>(idx: number, key: K, value: LineItem[K]) {
        setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
    }

    function addLine() { setLines((prev) => [...prev, emptyLine()]); }

    function removeLine(idx: number) {
        if (lines.length === 1) return;
        setLines((prev) => prev.filter((_, i) => i !== idx));
    }

    function getProducto(id: string) { return productos.find((p) => p.id === id); }

    // ── save ─────────────────────────────────────────────────────────────────

    async function handleSave() {
        const validLines = lines.filter((l) => l.productoId && l.cantidad > 0);
        if (!validLines.length) { setError("Agrega al menos un producto con cantidad"); return; }

        setSaving(true);
        const items = validLines.map((l) => {
            const p = getProducto(l.productoId);
            return {
                productoId:       l.productoId,
                cantidad:         l.cantidad,
                existenciaActual: p?.existenciaActual,
            };
        });

        const ok = await saveVenta({
            empresaId: companyId!,
            fecha,
            referencia: referencia.trim() || undefined,
            items,
        });
        setSaving(false);

        if (ok) {
            setReferencia("");
            setFecha(isoToday());
            setLines([emptyLine()]);
            loadMovimientos(companyId!, periodo);
        }
    }

    // ── recent salida from movimientos ─────────────────────────────────

    const salidasRecientes = useMemo(
        () => movimientos.filter((m) => m.tipo === "salida").slice(0, 30),
        [movimientos],
    );

    // ── render ───────────────────────────────────────────────────────────────

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                    Salida de Inventario
                </h1>
                <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mt-0.5">
                    Registra la salida de unidades del inventario
                </p>
            </div>

            <div className="px-8 py-6 grid grid-cols-5 gap-6">
                {/* Left: form */}
                <div className="col-span-2 space-y-4">

                    {error && (
                        <div className="px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                            {error}
                        </div>
                    )}

                    {/* Header fields */}
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-4">
                            Datos de la salida
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <label className={labelCls}>Fecha</label>
                                <input type="date" className={fieldCls} value={fecha}
                                    onChange={(e) => setFecha(e.target.value)} />
                            </div>
                            <div>
                                <label className={labelCls}>Referencia (opcional)</label>
                                <input className={fieldCls} value={referencia}
                                    onChange={(e) => setReferencia(e.target.value)}
                                    placeholder="Ej. Despacho almacén norte" />
                            </div>
                        </div>
                    </div>

                    {/* Line items */}
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
                                Productos
                            </h2>
                            <button
                                onClick={addLine}
                                className="h-8 px-3 rounded-lg border border-border-light hover:bg-surface-2 text-[11px] uppercase tracking-[0.12em] text-[var(--text-secondary)] transition-colors"
                            >
                                + Línea
                            </button>
                        </div>

                        <div className="space-y-3">
                            {lines.map((line, idx) => {
                                const prod = getProducto(line.productoId);
                                const stockOk = !prod || line.cantidad <= prod.existenciaActual;

                                return (
                                    <div key={idx} className="rounded-lg border border-border-light/70 bg-surface-2 p-3 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                                Línea {idx + 1}
                                            </span>
                                            {lines.length > 1 && (
                                                <button onClick={() => removeLine(idx)}
                                                    className="text-[11px] text-red-500/60 hover:text-red-500 transition-colors uppercase tracking-[0.10em]">
                                                    Quitar
                                                </button>
                                            )}
                                        </div>

                                        <select
                                            className={fieldCls}
                                            value={line.productoId}
                                            onChange={(e) => updateLine(idx, "productoId", e.target.value)}
                                        >
                                            <option value="">Seleccionar producto…</option>
                                            {productos.filter((p) => p.activo).map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.codigo ? `[${p.codigo}] ` : ""}{p.nombre}
                                                </option>
                                            ))}
                                        </select>

                                        {prod && (
                                            <div className="flex gap-2 text-[11px] text-[var(--text-tertiary)] px-1">
                                                <span>Existencia actual: <span className={`font-medium ${!stockOk && line.cantidad > 0 ? "text-red-500" : "text-foreground"}`}>{fmtN(prod.existenciaActual)}</span></span>
                                                <span>·</span>
                                                <span className="text-[var(--text-tertiary)]">{prod.unidadMedida}</span>
                                            </div>
                                        )}

                                        <div>
                                            <label className={labelCls}>Cantidad a retirar</label>
                                            <input type="number" min="0.0001" step="0.0001" className={fieldCls}
                                                value={line.cantidad || ""}
                                                onChange={(e) => updateLine(idx, "cantidad", parseFloat(e.target.value) || 0)} />
                                        </div>

                                        {prod && line.cantidad > 0 && (
                                            <div className="flex justify-between text-[12px] px-1 pt-1 border-t border-border-light/50">
                                                <span className="text-[var(--text-tertiary)]">Existencia tras salida</span>
                                                <span className={`tabular-nums font-medium ${!stockOk ? "text-red-500" : "text-foreground"}`}>
                                                    {fmtN(prod.existenciaActual - line.cantidad)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        onClick={handleSave} disabled={saving}
                        className="w-full h-10 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[13px] uppercase tracking-[0.12em] transition-colors"
                    >
                        {saving ? "Registrando…" : "Registrar salida"}
                    </button>
                </div>

                {/* Right: recent exits */}
                <div className="col-span-3">
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Salidas recientes
                            </p>
                            <div className="flex items-center gap-2">
                                <label className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Período</label>
                                <input
                                    type="month" className="h-8 px-2 rounded border border-border-light bg-surface-2 text-[12px] text-foreground outline-none"
                                    value={periodo}
                                    onChange={(e) => setPeriodo(e.target.value)}
                                />
                            </div>
                        </div>

                        {loadingMovimientos ? (
                            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                        ) : salidasRecientes.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                                No hay salidas para este período.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {["Fecha", "Producto", "Cantidad", "Saldo", "Referencia"].map((h) => (
                                                <th key={h} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {salidasRecientes.map((m) => {
                                            const prod = productos.find((p) => p.id === m.productoId);
                                            return (
                                                <tr key={m.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                    <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{m.fecha}</td>
                                                    <td className="px-3 py-2.5 text-foreground max-w-[140px] truncate">{prod?.nombre ?? m.productoId}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.cantidad)}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">{fmtN(m.saldoCantidad)}</td>
                                                    <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-[120px] truncate">{m.referencia || "—"}</td>
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
