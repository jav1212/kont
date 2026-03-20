"use client";

import { useEffect, useState, useMemo } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { LibroVentasRow } from "@/src/modules/inventory/backend/domain/libro-ventas";

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");
const labelCls = "font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

// ── helpers ──────────────────────────────────────────────────────────────────

function currentPeriod() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtN(n: number) {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function sum(rows: LibroVentasRow[], key: keyof LibroVentasRow): number {
    return rows.reduce((acc, r) => acc + (r[key] as number), 0);
}

function exportCSV(rows: LibroVentasRow[], periodo: string) {
    const headers = [
        "Fecha", "N° Factura", "RIF Cliente", "Cliente / Referencia",
        "Base Gravada", "IVA 16%", "Base Exenta", "Autoconsumo", "IVA Autoconsumo", "Total", "Tipo",
    ];
    const lines = [
        headers.join(","),
        ...rows.map((r) => [
            r.fecha,
            `"${r.numeroFactura}"`,
            `"${r.clienteRif}"`,
            `"${r.clienteNombre}"`,
            r.baseGravada,
            r.ivaDebito,
            r.baseExenta,
            r.autoconsumo,
            r.ivaAutoconsumo,
            r.total,
            r.tipo,
        ].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `libro-ventas-${periodo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── component ─────────────────────────────────────────────────────────────────

export default function LibroVentasPage() {
    const { companyId } = useCompany();
    const {
        libroVentas, loadingLibroVentas, error, setError, loadLibroVentas,
        productos, loadProductos, saveMovimiento,
    } = useInventory();

    const [periodo, setPeriodo] = useState(currentPeriod());
    const [searched, setSearched] = useState(false);

    // Devolución de venta state
    const [showDevModal, setShowDevModal] = useState(false);
    const [devProductoId, setDevProductoId] = useState("");
    const [devCantidad, setDevCantidad] = useState<number | "">("");
    const [devFecha, setDevFecha] = useState("");
    const [devNotaCredito, setDevNotaCredito] = useState("");
    const [devNotas, setDevNotas] = useState("");
    const [savingDev, setSavingDev] = useState(false);
    const [devSuccess, setDevSuccess] = useState(false);

    useEffect(() => {
        if (companyId) loadProductos(companyId);
    }, [companyId, loadProductos]);

    useEffect(() => {
        if (companyId && !searched) {
            loadLibroVentas(companyId, periodo);
            setSearched(true);
        }
    }, [companyId, periodo, loadLibroVentas, searched]);

    function openDevModal() {
        const today = new Date().toISOString().split("T")[0];
        setDevProductoId("");
        setDevCantidad("");
        setDevFecha(today);
        setDevNotaCredito("");
        setDevNotas("");
        setDevSuccess(false);
        setShowDevModal(true);
    }

    async function handleDevolucion() {
        if (!companyId || !devProductoId || !devCantidad || !devFecha) return;
        const producto = productos.find((p) => p.id === devProductoId);
        if (!producto) return;
        setSavingDev(true);
        setError(null);
        const ok = await saveMovimiento({
            empresaId:     companyId,
            productoId:    devProductoId,
            tipo:          "devolucion_venta",
            fecha:         devFecha,
            periodo:       devFecha.slice(0, 7),
            cantidad:      Number(devCantidad),
            costoUnitario: producto.costoPromedio ?? 0,
            costoTotal:    Number(devCantidad) * (producto.costoPromedio ?? 0),
            saldoCantidad: 0,
            referencia:    devNotaCredito || "DEV-VENTA",
            notas:         devNotas,
        });
        setSavingDev(false);
        if (ok) {
            setDevSuccess(true);
            setShowDevModal(false);
            loadLibroVentas(companyId, periodo);
        }
    }

    function handleSearch() {
        if (!companyId) return;
        setError(null);
        loadLibroVentas(companyId, periodo);
    }

    const ventas        = useMemo(() => libroVentas.filter((r) => r.tipo === "venta"),         [libroVentas]);
    const autoconsumos  = useMemo(() => libroVentas.filter((r) => r.tipo === "autoconsumo"),   [libroVentas]);

    const totales = useMemo(() => ({
        baseGravada:    sum(libroVentas, "baseGravada"),
        ivaDebito:      sum(libroVentas, "ivaDebito"),
        baseExenta:     sum(libroVentas, "baseExenta"),
        autoconsumo:    sum(libroVentas, "autoconsumo"),
        ivaAutoconsumo: sum(libroVentas, "ivaAutoconsumo"),
        total:          sum(libroVentas, "total"),
    }), [libroVentas]);

    const debitoFiscal = totales.ivaDebito + totales.ivaAutoconsumo;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Libro de Ventas IVA
                        </h1>
                        <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.16em] mt-0.5">
                            Reglamento Ley IVA Art. 70–72 — Débito fiscal mensual
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <label className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                Período
                            </label>
                            <input
                                type="month"
                                value={periodo}
                                onChange={(e) => { setPeriodo(e.target.value); setSearched(false); }}
                                className="h-8 px-2 rounded-lg border border-border-light bg-surface-1 text-[12px] text-foreground outline-none focus:border-primary-500/60"
                            />
                        </div>
                        <button
                            onClick={handleSearch}
                            disabled={loadingLibroVentas}
                            className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            {loadingLibroVentas ? "Cargando…" : "Generar"}
                        </button>
                        {libroVentas.length > 0 && (
                            <button
                                onClick={() => exportCSV(libroVentas, periodo)}
                                className="h-8 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Exportar CSV
                            </button>
                        )}
                        <button
                            onClick={openDevModal}
                            className="h-8 px-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] hover:bg-red-500/[0.12] text-red-500 text-[11px] uppercase tracking-[0.14em] transition-colors"
                        >
                            Registrar devolución
                        </button>
                    </div>
                </div>
            </div>

            {/* Devolución de Venta Modal */}
            {showDevModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-border-light rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.16em] text-foreground">
                                Registrar Devolución de Venta
                            </h2>
                            <button
                                onClick={() => setShowDevModal(false)}
                                className="text-[var(--text-tertiary)] hover:text-foreground text-[11px] uppercase tracking-[0.12em]"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="px-6 py-4 space-y-4">
                            <div>
                                <label className={labelCls}>Producto</label>
                                <select
                                    className={fieldCls}
                                    value={devProductoId}
                                    onChange={(e) => setDevProductoId(e.target.value)}
                                >
                                    <option value="">Seleccionar producto…</option>
                                    {productos.filter((p) => p.activo !== false).map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.codigo} — {p.nombre}
                                        </option>
                                    ))}
                                </select>
                                {devProductoId && (() => {
                                    const p = productos.find((x) => x.id === devProductoId);
                                    return p ? (
                                        <p className="mt-1 text-[9px] text-[var(--text-tertiary)]">
                                            Costo promedio: {fmtN(p.costoPromedio ?? 0)} Bs.
                                            {" · "}Existencia actual: {p.existenciaActual ?? 0}
                                        </p>
                                    ) : null;
                                })()}
                            </div>

                            <div>
                                <label className={labelCls}>Cantidad a devolver</label>
                                <input
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    className={fieldCls}
                                    value={devCantidad}
                                    onChange={(e) => setDevCantidad(parseFloat(e.target.value) || "")}
                                    placeholder="0"
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Nota de crédito del cliente</label>
                                <input
                                    className={fieldCls}
                                    value={devNotaCredito}
                                    onChange={(e) => setDevNotaCredito(e.target.value)}
                                    placeholder="Nº nota de crédito…"
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Fecha</label>
                                <input
                                    type="date"
                                    className={fieldCls}
                                    value={devFecha}
                                    onChange={(e) => setDevFecha(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                <textarea
                                    className={`${fieldCls} h-auto py-2`}
                                    rows={2}
                                    value={devNotas}
                                    onChange={(e) => setDevNotas(e.target.value)}
                                    placeholder="Motivo de la devolución…"
                                />
                            </div>

                            {devProductoId && devCantidad && (
                                <div className="text-[10px] text-[var(--text-tertiary)]">
                                    Costo total a restaurar:{" "}
                                    <span className="tabular-nums font-bold text-green-500">
                                        {fmtN(Number(devCantidad) * (productos.find((p) => p.id === devProductoId)?.costoPromedio ?? 0))} Bs.
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <button
                                onClick={() => setShowDevModal(false)}
                                disabled={savingDev}
                                className="h-8 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDevolucion}
                                disabled={savingDev || !devProductoId || !devCantidad || !devFecha}
                                className="h-8 px-4 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.14em] transition-colors"
                            >
                                {savingDev ? "Registrando…" : "Confirmar devolución"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-8 py-6">
                {devSuccess && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-600 text-[11px]">
                        Devolución de venta registrada — movimiento devolucion_venta creado.
                    </div>
                )}
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {loadingLibroVentas ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">Cargando libro de ventas…</div>
                ) : libroVentas.length === 0 ? (
                    <div className="py-16 text-center text-[11px] text-[var(--text-tertiary)]">
                        No hay ventas ni autoconsumos para el período seleccionado.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-[10px] whitespace-nowrap">
                                    <thead>
                                        <tr className="border-b border-border-light bg-surface-2">
                                            {[
                                                { label: "Fecha",          align: "left",  width: "min-w-[90px]"  },
                                                { label: "N° Factura",     align: "left",  width: "min-w-[120px]" },
                                                { label: "RIF Cliente",    align: "left",  width: "min-w-[110px]" },
                                                { label: "Cliente",        align: "left",  width: "min-w-[160px]" },
                                                { label: "Base Grav.",     align: "right", width: "min-w-[100px]" },
                                                { label: "IVA 16%",        align: "right", width: "min-w-[90px]"  },
                                                { label: "Base Exenta",    align: "right", width: "min-w-[100px]" },
                                                { label: "Autoconsumo",    align: "right", width: "min-w-[100px]" },
                                                { label: "IVA Autocons.",  align: "right", width: "min-w-[100px]" },
                                                { label: "Total",          align: "right", width: "min-w-[110px]" },
                                            ].map((col) => (
                                                <th key={col.label}
                                                    className={`px-3 py-2.5 text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-normal text-${col.align} ${col.width}`}>
                                                    {col.label}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {libroVentas.map((row) => (
                                            <tr key={row.id}
                                                className={`border-b border-border-light/50 hover:bg-surface-2 transition-colors ${
                                                    row.tipo === "autoconsumo"
                                                        ? "bg-amber-500/[0.025]"
                                                        : ""
                                                }`}>
                                                <td className="px-3 py-2 text-[var(--text-secondary)]">{row.fecha}</td>
                                                <td className="px-3 py-2 text-foreground">
                                                    {row.tipo === "autoconsumo" ? (
                                                        <span className="inline-flex items-center gap-1">
                                                            <span className="px-1.5 py-0.5 rounded text-[8px] uppercase tracking-[0.10em] border border-amber-500/40 text-amber-500 bg-amber-500/[0.06]">
                                                                Autoconsumo
                                                            </span>
                                                        </span>
                                                    ) : (
                                                        row.numeroFactura || "—"
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 text-[var(--text-secondary)]">{row.clienteRif || "—"}</td>
                                                <td className="px-3 py-2 text-foreground max-w-[180px] truncate" title={row.clienteNombre}>
                                                    {row.clienteNombre || "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-primary)]">
                                                    {row.baseGravada > 0 ? fmtN(row.baseGravada) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-primary)]">
                                                    {row.ivaDebito > 0 ? fmtN(row.ivaDebito) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-[var(--text-secondary)]">
                                                    {row.baseExenta > 0 ? fmtN(row.baseExenta) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-amber-500/80">
                                                    {row.autoconsumo > 0 ? fmtN(row.autoconsumo) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right text-amber-500/80">
                                                    {row.ivaAutoconsumo > 0 ? fmtN(row.ivaAutoconsumo) : "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-right font-medium text-foreground">
                                                    {fmtN(row.total)}
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Totales */}
                                        <tr className="border-t-2 border-primary-500/30 bg-primary-500/[0.04]">
                                            <td className="px-3 py-2.5 text-[10px] uppercase tracking-[0.14em] font-bold text-foreground" colSpan={4}>
                                                Total del período
                                            </td>
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">{fmtN(totales.baseGravada)}</td>
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">{fmtN(totales.ivaDebito)}</td>
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">{fmtN(totales.baseExenta)}</td>
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-amber-500">{fmtN(totales.autoconsumo)}</td>
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-amber-500">{fmtN(totales.ivaAutoconsumo)}</td>
                                            <td className="px-3 py-2.5 tabular-nums text-right text-[11px] font-bold text-foreground">{fmtN(totales.total)}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>

                            {/* Resumen débito fiscal */}
                            <div className="px-4 py-3 border-t border-border-light bg-surface-2 flex items-center gap-6 flex-wrap">
                                <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] font-medium">
                                    Débito fiscal total del período:
                                </span>
                                <span className="text-[13px] font-bold tabular-nums text-primary-500">
                                    {fmtN(debitoFiscal)} Bs.
                                </span>
                                <div className="flex items-center gap-4 text-[9px] text-[var(--text-tertiary)]">
                                    <span>
                                        IVA ventas: <span className="tabular-nums text-foreground font-medium">{fmtN(totales.ivaDebito)}</span>
                                    </span>
                                    {totales.ivaAutoconsumo > 0 && (
                                        <>
                                            <span>+</span>
                                            <span>
                                                IVA autoconsumos: <span className="tabular-nums text-amber-500 font-medium">{fmtN(totales.ivaAutoconsumo)}</span>
                                            </span>
                                        </>
                                    )}
                                </div>
                                <span className="text-[9px] text-[var(--text-tertiary)]">
                                    ({ventas.length} {ventas.length === 1 ? "factura" : "facturas"}
                                    {autoconsumos.length > 0 ? ` + ${autoconsumos.length} autoconsumo${autoconsumos.length !== 1 ? "s" : ""}` : ""})
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
