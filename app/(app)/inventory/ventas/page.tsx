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
    precioVentaUnitario: number;
    ivaTipo: "general_16" | "reducida_8" | "exento";
}

function emptyLine(): LineItem {
    return { productoId: "", cantidad: 0, precioVentaUnitario: 0, ivaTipo: "general_16" };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function VentasPage() {
    const { companyId } = useCompany();
    const {
        productos, movimientos,
        loadingProductos, loadingMovimientos, error, setError,
        loadProductos, loadMovimientos, saveVenta,
    } = useInventory();

    const [periodo, setPeriodo] = useState(currentPeriod());
    const [saving, setSaving] = useState(false);

    // Form header
    const [numeroFactura, setNumeroFactura] = useState("");
    const [clienteRif, setClienteRif]       = useState("");
    const [clienteNombre, setClienteNombre] = useState("");
    const [fecha, setFecha]                 = useState(isoToday());

    // Line items
    const [lines, setLines] = useState<LineItem[]>([emptyLine()]);

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

    // ── totals ───────────────────────────────────────────────────────────────

    const totales = useMemo(() => {
        let baseGravada16 = 0, ivaDebito16 = 0;
        let baseGravada8  = 0, ivaDebito8  = 0;
        let baseExenta    = 0;
        for (const l of lines) {
            const sub = l.cantidad * l.precioVentaUnitario;
            if (l.ivaTipo === "general_16") {
                baseGravada16 += sub;
                ivaDebito16   += Math.round(sub * 0.16 * 100) / 100;
            } else if (l.ivaTipo === "reducida_8") {
                baseGravada8 += sub;
                ivaDebito8   += Math.round(sub * 0.08 * 100) / 100;
            } else {
                baseExenta += sub;
            }
        }
        const totalIva = ivaDebito16 + ivaDebito8;
        const baseGravada = baseGravada16 + baseGravada8;
        return { baseGravada16, ivaDebito16, baseGravada8, ivaDebito8, baseExenta, baseGravada, ivaDebito: totalIva, total: baseGravada + totalIva + baseExenta };
    }, [lines]);

    // ── save ─────────────────────────────────────────────────────────────────

    async function handleSave() {
        if (!numeroFactura.trim()) { setError("El número de factura es requerido"); return; }
        if (!clienteRif.trim()) { setError("El RIF del cliente es requerido (Art. 14 Providencia SNAT/2011/00071)"); return; }
        if (!clienteNombre.trim()) { setError("El nombre del cliente es requerido"); return; }
        const validLines = lines.filter((l) => l.productoId && l.cantidad > 0 && l.precioVentaUnitario > 0);
        if (!validLines.length) { setError("Agrega al menos un producto con cantidad y precio"); return; }

        setSaving(true);
        const items = validLines.map((l) => {
            const p = getProducto(l.productoId);
            return {
                productoId:          l.productoId,
                cantidad:            l.cantidad,
                precioVentaUnitario: l.precioVentaUnitario,
                ivaTipo:             l.ivaTipo,
                existenciaActual:    p?.existenciaActual,
            };
        });

        const ok = await saveVenta({
            empresaId: companyId!,
            numeroFactura,
            clienteRif,
            clienteNombre,
            fecha,
            items,
        });
        setSaving(false);

        if (ok) {
            setNumeroFactura("");
            setClienteRif("");
            setClienteNombre("");
            setFecha(isoToday());
            setLines([emptyLine()]);
            loadMovimientos(companyId!, periodo);
        }
    }

    // ── recent salida_venta from movimientos ─────────────────────────────────

    const ventasRecientes = useMemo(
        () => movimientos.filter((m) => m.tipo === "salida_venta").slice(0, 30),
        [movimientos],
    );

    // ── render ───────────────────────────────────────────────────────────────

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                    Nota de Despacho / Factura de Venta
                </h1>
                <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mt-0.5">
                    Registra salidas por venta con datos del cliente e IVA
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
                            Datos del cliente
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <label className={labelCls}>N° Factura *</label>
                                <input className={fieldCls} value={numeroFactura}
                                    onChange={(e) => setNumeroFactura(e.target.value)}
                                    placeholder="Ej. 0001-0123456" />
                            </div>
                            <div>
                                <label className={labelCls}>RIF Cliente *</label>
                                <input className={fieldCls} value={clienteRif}
                                    onChange={(e) => setClienteRif(e.target.value)}
                                    placeholder="Ej. J-12345678-9"
                                    required />
                            </div>
                            <div>
                                <label className={labelCls}>Nombre Cliente *</label>
                                <input className={fieldCls} value={clienteNombre}
                                    onChange={(e) => setClienteNombre(e.target.value)}
                                    placeholder="Razón social o nombre" />
                            </div>
                            <div>
                                <label className={labelCls}>Fecha</label>
                                <input type="date" className={fieldCls} value={fecha}
                                    onChange={(e) => setFecha(e.target.value)} />
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
                                const sub  = line.cantidad * line.precioVentaUnitario;
                                const iva  = line.ivaTipo === "general_16"
                                    ? Math.round(sub * 0.16 * 100) / 100
                                    : line.ivaTipo === "reducida_8"
                                    ? Math.round(sub * 0.08 * 100) / 100
                                    : 0;
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
                                            onChange={(e) => {
                                                const p = getProducto(e.target.value);
                                                updateLine(idx, "productoId", e.target.value);
                                                if (p) updateLine(idx, "ivaTipo", p.ivaTipo === "exento" ? "exento" : "general_16");
                                            }}
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
                                                <span>Exist: <span className={`font-medium ${!stockOk && line.cantidad > 0 ? "text-red-500" : "text-foreground"}`}>{fmtN(prod.existenciaActual)}</span></span>
                                                <span>·</span>
                                                <span>IVA prod.: <span className="font-medium text-foreground">{prod.ivaTipo === "exento" ? "Exento" : "16%"}</span></span>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className={labelCls}>Cantidad</label>
                                                <input type="number" min="0.0001" step="0.0001" className={fieldCls}
                                                    value={line.cantidad || ""}
                                                    onChange={(e) => updateLine(idx, "cantidad", parseFloat(e.target.value) || 0)} />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Precio venta</label>
                                                <input type="number" min="0" step="0.01" className={fieldCls}
                                                    value={line.precioVentaUnitario || ""}
                                                    onChange={(e) => updateLine(idx, "precioVentaUnitario", parseFloat(e.target.value) || 0)} />
                                            </div>
                                        </div>

                                        <div>
                                            <label className={labelCls}>IVA</label>
                                            <select className={fieldCls} value={line.ivaTipo}
                                                onChange={(e) => updateLine(idx, "ivaTipo", e.target.value as "general_16" | "reducida_8" | "exento")}>
                                                <option value="general_16">16% General</option>
                                                <option value="reducida_8">8% Reducida</option>
                                                <option value="exento">Exento</option>
                                            </select>
                                        </div>

                                        {line.cantidad > 0 && line.precioVentaUnitario > 0 && (
                                            <div className="flex justify-between text-[12px] px-1 pt-1 border-t border-border-light/50">
                                                <span className="text-[var(--text-tertiary)]">Subtotal + IVA</span>
                                                <span className="tabular-nums text-foreground font-medium">
                                                    {fmtN(sub)} + {fmtN(iva)} = {fmtN(sub + iva)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Totals preview */}
                    {lines.some((l) => l.cantidad > 0 && l.precioVentaUnitario > 0) && (
                        <div className="rounded-xl border border-border-light bg-surface-1 p-4 space-y-2">
                            <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-3">Resumen de factura</p>
                            {totales.baseGravada16 > 0 && (
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-[var(--text-secondary)]">Base gravada 16%</span>
                                    <span className="tabular-nums text-foreground">{fmtN(totales.baseGravada16)}</span>
                                </div>
                            )}
                            {totales.ivaDebito16 > 0 && (
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-[var(--text-secondary)]">IVA 16%</span>
                                    <span className="tabular-nums text-foreground">{fmtN(totales.ivaDebito16)}</span>
                                </div>
                            )}
                            {totales.baseGravada8 > 0 && (
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-[var(--text-secondary)]">Base gravada 8%</span>
                                    <span className="tabular-nums text-foreground">{fmtN(totales.baseGravada8)}</span>
                                </div>
                            )}
                            {totales.ivaDebito8 > 0 && (
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-[var(--text-secondary)]">IVA 8% reducida</span>
                                    <span className="tabular-nums text-foreground">{fmtN(totales.ivaDebito8)}</span>
                                </div>
                            )}
                            {totales.baseExenta > 0 && (
                                <div className="flex justify-between text-[13px]">
                                    <span className="text-[var(--text-secondary)]">Base exenta</span>
                                    <span className="tabular-nums text-foreground">{fmtN(totales.baseExenta)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-[15px] font-bold pt-2 border-t border-border-light">
                                <span className="text-foreground">Total</span>
                                <span className="tabular-nums text-foreground">{fmtN(totales.total)} Bs.</span>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={handleSave} disabled={saving}
                        className="w-full h-10 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[13px] uppercase tracking-[0.12em] transition-colors"
                    >
                        {saving ? "Registrando…" : "Registrar venta"}
                    </button>
                </div>

                {/* Right: recent sales */}
                <div className="col-span-3">
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Ventas recientes
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
                        ) : ventasRecientes.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                                No hay ventas para este período.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {["Fecha", "Factura", "Cliente", "Producto", "Cant.", "Precio Vta.", "IVA", "Total"].map((h) => (
                                                <th key={h} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ventasRecientes.map((m) => {
                                            const prod = productos.find((p) => p.id === m.productoId);
                                            const precioVenta = m.precioVentaUnitario ?? 0;
                                            const totalVenta  = precioVenta * m.cantidad + (m.ivaVentaMonto ?? 0);
                                            return (
                                                <tr key={m.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                    <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{m.fecha}</td>
                                                    <td className="px-3 py-2.5 text-foreground max-w-[90px] truncate">{m.numeroFacturaVenta || m.referencia || "—"}</td>
                                                    <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-[100px] truncate">{m.clienteNombre || "—"}</td>
                                                    <td className="px-3 py-2.5 text-foreground max-w-[100px] truncate">{prod?.nombre ?? m.productoId}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.cantidad)}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">{precioVenta > 0 ? fmtN(precioVenta) : "—"}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">{m.ivaVentaMonto ? fmtN(m.ivaVentaMonto) : "—"}</td>
                                                    <td className="px-3 py-2.5 tabular-nums font-medium text-foreground">{totalVenta > 0 ? fmtN(totalVenta) : "—"}</td>
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
