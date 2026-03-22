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
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const TIPO_GROUPS = [
    {
        label: "Devoluciones",
        items: [
            { value: "devolucion_entrada", label: "Devolución entrada" },
            { value: "devolucion_salida",  label: "Devolución salida"  },
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

// entradas/salidas de compra, venta y producción se registran desde sus páginas dedicadas
// autoconsumo is excluded from the main form and has its own dedicated section

function tipoBadgeClass(tipo: TipoMovimiento): string {
    if (["entrada","entrada_produccion","devolucion_salida"].includes(tipo))
        return "border badge-success";
    if (["salida","salida_produccion","devolucion_entrada"].includes(tipo))
        return "border badge-error";
    if (tipo === "autoconsumo") return "border border-amber-500/40 text-amber-500 bg-amber-500/[0.06]";
    if (tipo === "ajuste_positivo") return "border badge-warning";
    return "border badge-warning";
}

function tipoLabel(tipo: TipoMovimiento) {
    const all = [...TIPO_GROUPS.flatMap((g) => g.items), { value: "autoconsumo", label: "Autoconsumo" }];
    return all.find((i) => i.value === tipo)?.label ?? tipo;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MovimientosPage() {
    const { companyId } = useCompany();
    const {
        productos, movimientos,
        loadingProductos, loadingMovimientos, error, setError,
        loadProductos, loadMovimientos, saveMovimiento,
        loadCierres, tasaDolarActual,
    } = useInventory();

    const [periodo, setPeriodo] = useState(currentPeriod());
    const [saving, setSaving] = useState(false);
    const [tasaDolarStr, setTasaDolarStr] = useState<string>("");
    const [tasaBcvLoading, setTasaBcvLoading] = useState(false);
    const [tasaBcvFecha, setTasaBcvFecha] = useState<string | null>(null);
    const [tasaBcvError, setTasaBcvError] = useState<string | null>(null);

    // ── main form state ──────────────────────────────────────────────────────
    const emptyForm = (): Omit<Movimiento, "saldoCantidad" | "costoTotal" | "periodo"> & { saldoCantidad: number; costoTotal: number; periodo: string; moneda: 'B' | 'D'; costoMoneda: number } => ({
        empresaId:    companyId ?? "",
        productoId:   "",
        tipo:         "entrada" as TipoMovimiento,
        fecha:        isoToday(),
        periodo:      currentPeriod(),
        cantidad:     0,
        costoUnitario: 0,
        costoTotal:   0,
        saldoCantidad: 0,
        referencia:   "",
        notas:        "",
        moneda:       "B",
        costoMoneda:  0,
    });

    const [form, setForm] = useState(emptyForm());

    // ── autoconsumo form state ───────────────────────────────────────────────
    const emptyAcForm = () => ({ productoId: "", cantidad: 0, fecha: isoToday(), notas: "" });
    const [acForm, setAcForm] = useState(emptyAcForm());
    const [acStep, setAcStep] = useState<"form" | "confirm">("form");
    const [acSaving, setAcSaving] = useState(false);

    const acProducto = useMemo(
        () => productos.find((p) => p.id === acForm.productoId),
        [acForm.productoId, productos],
    );
    const acCostoTotal = acProducto ? acForm.cantidad * acProducto.costoPromedio : 0;
    const acIva        = acProducto?.ivaTipo === "general" ? acCostoTotal * 0.16 : 0;
    const acStockOk    = !acProducto || acForm.cantidad <= acProducto.existenciaActual;

    // ── effects ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!companyId) return;
        loadProductos(companyId);
        loadMovimientos(companyId, periodo);
        loadCierres(companyId);
    }, [companyId, loadProductos, loadMovimientos, loadCierres, periodo]);

    // Pre-fill tasa from last cierre
    useEffect(() => {
        if (tasaDolarActual != null && tasaDolarStr === "") {
            setTasaDolarStr(String(tasaDolarActual));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasaDolarActual]);

    // Auto-fetch BCV rate when form date changes
    useEffect(() => {
        if (!form.fecha) return;
        let cancelled = false;
        setTasaBcvLoading(true);
        setTasaBcvFecha(null);
        setTasaBcvError(null);
        fetch(`/api/bcv/rate?date=${form.fecha}&code=USD`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                if (json.rate) {
                    setTasaDolarStr(String(json.rate));
                    setTasaBcvFecha(json.date);
                } else {
                    setTasaBcvError(json.error ?? 'Sin datos BCV para esta fecha');
                    setTasaBcvFecha(null);
                }
            })
            .catch(() => { if (!cancelled) { setTasaBcvError('Error al consultar BCV'); setTasaBcvFecha(null); } })
            .finally(() => { if (!cancelled) setTasaBcvLoading(false); });
        return () => { cancelled = true; };
    }, [form.fecha]);

    // Pre-fill costo unitario when producto changes (main form)
    useEffect(() => {
        if (!form.productoId) return;
        const p = productos.find((x) => x.id === form.productoId);
        if (!p) return;
        setForm((f) => ({
            ...f,
            moneda: 'B',
            costoUnitario: p.costoPromedio,
            costoMoneda:   0,
            empresaId:     companyId ?? "",
        }));
    }, [form.productoId, productos, companyId]);

    const tasaDolar = useMemo(() => {
        const v = parseFloat(tasaDolarStr.replace(",", "."));
        return isNaN(v) || v <= 0 ? null : v;
    }, [tasaDolarStr]);

    const costoUnitarioEffective = useMemo(() => {
        if (form.moneda === 'D' && form.costoMoneda > 0 && tasaDolar) {
            return Math.round(form.costoMoneda * tasaDolar * 10000) / 10000;
        }
        return form.costoUnitario;
    }, [form.moneda, form.costoMoneda, form.costoUnitario, tasaDolar]);

    const costoTotal = useMemo(() =>
        form.cantidad * costoUnitarioEffective,
    [form.cantidad, costoUnitarioEffective]);

    // ── main form handlers ───────────────────────────────────────────────────
    function setF<K extends keyof typeof form>(k: K, v: typeof form[K]) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    async function handleSave() {
        if (!form.productoId) { setError("Selecciona un producto"); return; }
        if (!form.cantidad || form.cantidad <= 0) { setError("La cantidad debe ser mayor a 0"); return; }
        setSaving(true);
        const producto = productos.find((p) => p.id === form.productoId);
        const mov: Movimiento = {
            ...form,
            empresaId:    companyId!,
            costoUnitario: costoUnitarioEffective,
            costoTotal,
            saldoCantidad: 0,
            periodo:      form.fecha.slice(0, 7),
            existenciaActual: producto?.existenciaActual,
            moneda:       form.moneda,
            costoMoneda:  form.moneda === 'D' ? form.costoMoneda : undefined,
            tasaDolar:    form.moneda === 'D' ? tasaDolar : undefined,
        };
        const saved = await saveMovimiento(mov);
        setSaving(false);
        if (saved) {
            setForm(emptyForm());
            loadMovimientos(companyId!, periodo);
        }
    }

    // ── autoconsumo handlers ─────────────────────────────────────────────────
    function setAc<K extends keyof typeof acForm>(k: K, v: typeof acForm[K]) {
        setAcForm((f) => ({ ...f, [k]: v }));
    }

    function handleAcPreview() {
        if (!acForm.productoId) { setError("Selecciona un producto para el autoconsumo"); return; }
        if (!acForm.cantidad || acForm.cantidad <= 0) { setError("La cantidad debe ser mayor a 0"); return; }
        if (!acStockOk) {
            setError(`Stock insuficiente. Existencia actual: ${fmtN(acProducto!.existenciaActual)}`);
            return;
        }
        setError(null);
        setAcStep("confirm");
    }

    async function handleAcConfirm() {
        if (!acProducto) return;
        setAcSaving(true);
        const mov: Movimiento = {
            empresaId:        companyId!,
            productoId:       acForm.productoId,
            tipo:             "autoconsumo",
            fecha:            acForm.fecha,
            periodo:          acForm.fecha.slice(0, 7),
            cantidad:         acForm.cantidad,
            costoUnitario:    acProducto.costoPromedio,
            costoTotal:       acCostoTotal,
            saldoCantidad:    0,
            referencia:       "",
            notas:            acForm.notas,
            existenciaActual: acProducto.existenciaActual,
        };
        const saved = await saveMovimiento(mov);
        setAcSaving(false);
        if (saved) {
            setAcForm(emptyAcForm());
            setAcStep("form");
            loadMovimientos(companyId!, periodo);
            loadProductos(companyId!);
        }
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                    Ajustes y Devoluciones
                </h1>
                <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mt-0.5">
                    Correcciones de inventario y devoluciones — entradas en Entradas · salidas en Salidas
                </p>
            </div>

            <div className="px-8 py-6 grid grid-cols-5 gap-6">
                {/* Left: forms */}
                <div className="col-span-2 space-y-4">

                    {/* ── Error banner ─────────────────────────────────────── */}
                    {error && (
                        <div className="px-3 py-2.5 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                            {error}
                        </div>
                    )}

                    {/* ── Main movement form ───────────────────────────────── */}
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                        <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-4">
                            Nuevo ajuste / devolución
                        </h2>

                        {/* Tasa BCV */}
                        <div className="mb-4 flex items-center gap-3 flex-wrap">
                            <label className={labelCls + " mb-0 whitespace-nowrap"}>Tasa BCV (Bs/USD)</label>
                            <input
                                type="number" min="0" step="0.0001"
                                className="h-8 w-36 px-3 rounded-lg border border-border-light bg-surface-2 outline-none font-mono text-[12px] text-foreground focus:border-primary-500/60 transition-colors disabled:opacity-60"
                                value={tasaDolarStr}
                                onChange={(e) => { setTasaDolarStr(e.target.value); setTasaBcvFecha(null); }}
                                placeholder={tasaBcvLoading ? 'Consultando…' : 'Ej. 46.50'}
                                disabled={tasaBcvLoading}
                            />
                            {tasaBcvLoading && <span className="text-[11px] text-[var(--text-tertiary)] animate-pulse">···</span>}
                            {tasaBcvFecha && !tasaBcvLoading && <span className="text-[11px] text-green-500 uppercase tracking-[0.12em]">BCV {tasaBcvFecha}</span>}
                            {tasaBcvError && !tasaBcvLoading && <span className="text-[11px] text-amber-500">{tasaBcvError}</span>}
                        </div>

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
                                <label className={labelCls}>Moneda</label>
                                <select
                                    className={fieldCls}
                                    value={form.moneda}
                                    onChange={(e) => setF("moneda", e.target.value as 'B' | 'D')}
                                >
                                    <option value="B">Bolívares (Bs)</option>
                                    <option value="D">Dólares (USD)</option>
                                </select>
                            </div>

                            {form.moneda === 'D' ? (
                                <div>
                                    <label className={labelCls}>Costo USD</label>
                                    <input
                                        type="number" min="0" step="0.0001" className={fieldCls}
                                        value={form.costoMoneda || ""}
                                        onChange={(e) => setF("costoMoneda", parseFloat(e.target.value) || 0)}
                                        placeholder="Costo en dólares"
                                    />
                                    {tasaDolar && form.costoMoneda > 0 && (
                                        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                                            = {fmtN(form.costoMoneda * tasaDolar)} Bs
                                            {" "}(tasa {fmtN(tasaDolar)} Bs/USD)
                                        </p>
                                    )}
                                    {!tasaDolar && (
                                        <p className="mt-1 text-[11px] text-amber-500">
                                            Ingresa la tasa BCV para calcular el costo en Bs
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <label className={labelCls}>Costo unitario (Bs)</label>
                                    <input
                                        type="number" min="0" step="0.0001" className={fieldCls}
                                        value={form.costoUnitario || ""}
                                        onChange={(e) => setF("costoUnitario", parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                            )}

                            <div>
                                <label className={labelCls}>Costo total Bs (calculado)</label>
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
                                className="w-full h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {saving ? "Registrando…" : "Registrar ajuste"}
                            </button>
                        </div>
                    </div>

                    {/* ── Autoconsumo section ──────────────────────────────── */}
                    <div className="rounded-xl border border-amber-500/30 bg-surface-1 p-5">
                        <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-amber-500 mb-0.5">
                            Autoconsumo
                        </h2>
                        <p className="text-[11px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mb-4">
                            Retiro de bienes — hecho imponible IVA
                        </p>

                        {/* Warning */}
                        <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg border border-amber-500/25 bg-amber-500/[0.05]">
                            <span className="text-amber-500 text-[13px] leading-none mt-0.5">⚠</span>
                            <p className="text-[12px] text-amber-500/90 leading-relaxed">
                                Esta operación genera un <strong>débito fiscal de IVA</strong> que debe
                                declararse ante el SENIAT.
                            </p>
                        </div>

                        {acStep === "form" ? (
                            <div className="space-y-3">
                                <div>
                                    <label className={labelCls}>Producto *</label>
                                    <select
                                        className={fieldCls}
                                        value={acForm.productoId}
                                        onChange={(e) => setAc("productoId", e.target.value)}
                                    >
                                        <option value="">Seleccionar…</option>
                                        {productos.filter((p) => p.activo).map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.codigo ? `[${p.codigo}] ` : ""}{p.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Product info */}
                                {acProducto && (
                                    <div className="grid grid-cols-2 gap-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border-light">
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-0.5">Costo promedio</p>
                                            <p className="text-[12px] tabular-nums text-foreground">{fmtN(acProducto.costoPromedio)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-0.5">IVA tipo</p>
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium border ${
                                                acProducto.ivaTipo === "general"
                                                    ? "border-primary-500/30 text-primary-500 bg-primary-500/[0.06]"
                                                    : "border-border-light text-[var(--text-tertiary)]"
                                            }`}>
                                                {acProducto.ivaTipo === "general" ? "16% General" : "Exento"}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-0.5">Existencia actual</p>
                                            <p className={`text-[12px] tabular-nums ${acForm.cantidad > acProducto.existenciaActual && acForm.cantidad > 0 ? "text-red-500" : "text-foreground"}`}>
                                                {fmtN(acProducto.existenciaActual)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className={labelCls}>Fecha</label>
                                    <input
                                        type="date" className={fieldCls}
                                        value={acForm.fecha}
                                        onChange={(e) => setAc("fecha", e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className={labelCls}>Cantidad a retirar *</label>
                                    <input
                                        type="number" min="0.0001" step="0.0001" className={fieldCls}
                                        value={acForm.cantidad || ""}
                                        onChange={(e) => setAc("cantidad", parseFloat(e.target.value) || 0)}
                                    />
                                    {!acStockOk && acForm.cantidad > 0 && (
                                        <p className="mt-1 text-[11px] text-red-500">
                                            Supera la existencia disponible
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <label className={labelCls}>Motivo / Notas</label>
                                    <input
                                        className={fieldCls}
                                        value={acForm.notas}
                                        onChange={(e) => setAc("notas", e.target.value)}
                                        placeholder="Ej. Uso interno, muestra, pérdida…"
                                    />
                                </div>

                                {/* IVA preview */}
                                {acProducto && acForm.cantidad > 0 && (
                                    <div className="px-3 py-3 rounded-lg border border-border-light bg-surface-2 space-y-1.5">
                                        <p className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-2">Preview</p>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Costo retirado</span>
                                            <span className="tabular-nums text-foreground">{fmtN(acCostoTotal)}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className={acIva > 0 ? "text-amber-500" : "text-[var(--text-secondary)]"}>
                                                IVA 16% {acProducto.ivaTipo === "exento" ? "(exento)" : "débito fiscal"}
                                            </span>
                                            <span className={`tabular-nums font-medium ${acIva > 0 ? "text-amber-500" : "text-[var(--text-secondary)]"}`}>
                                                {fmtN(acIva)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[12px] pt-1.5 border-t border-border-light">
                                            <span className="font-bold text-foreground">Total impacto</span>
                                            <span className="tabular-nums font-bold text-foreground">{fmtN(acCostoTotal + acIva)}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-1">
                                    <button
                                        onClick={handleAcPreview}
                                        disabled={!acForm.productoId || !acForm.cantidad || !acStockOk}
                                        className="w-full h-9 rounded-lg border border-amber-500/50 hover:bg-amber-500/10 disabled:opacity-40 text-amber-500 text-[12px] uppercase tracking-[0.12em] transition-colors"
                                    >
                                        Revisar y confirmar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Confirmation step */
                            <div className="space-y-4">
                                <div className="px-4 py-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.04] space-y-3">
                                    <p className="text-[11px] uppercase tracking-[0.12em] text-amber-500/70 mb-2">Confirmar autoconsumo</p>

                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Producto</span>
                                            <span className="text-foreground font-medium">{acProducto?.nombre}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Cantidad</span>
                                            <span className="tabular-nums text-foreground">{fmtN(acForm.cantidad)}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Costo unitario</span>
                                            <span className="tabular-nums text-foreground">{fmtN(acProducto?.costoPromedio ?? 0)}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Costo total retirado</span>
                                            <span className="tabular-nums text-foreground">{fmtN(acCostoTotal)}</span>
                                        </div>
                                        {acForm.notas && (
                                            <div className="flex justify-between text-[12px]">
                                                <span className="text-[var(--text-secondary)]">Motivo</span>
                                                <span className="text-foreground max-w-[140px] truncate text-right">{acForm.notas}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* IVA highlight */}
                                    <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-1.5">
                                        <div className="flex justify-between items-center text-[12px]">
                                            <span className="text-amber-500 font-bold uppercase tracking-[0.10em] text-[12px]">
                                                Débito fiscal IVA 16%
                                            </span>
                                            <span className={`tabular-nums font-bold text-[15px] ${acIva > 0 ? "text-amber-500" : "text-[var(--text-secondary)]"}`}>
                                                {fmtN(acIva)}
                                            </span>
                                        </div>
                                        {acIva === 0 && (
                                            <p className="text-[11px] text-[var(--text-tertiary)]">Producto exento — no genera débito fiscal</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setAcStep("form")}
                                        disabled={acSaving}
                                        className="flex-1 h-9 rounded-lg border border-border-light hover:bg-surface-2 disabled:opacity-50 text-[var(--text-secondary)] text-[12px] uppercase tracking-[0.12em] transition-colors"
                                    >
                                        Volver
                                    </button>
                                    <button
                                        onClick={handleAcConfirm}
                                        disabled={acSaving}
                                        className="flex-1 h-9 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                                    >
                                        {acSaving ? "Registrando…" : "Confirmar"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: history */}
                <div className="col-span-3">
                    <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                            <p className="text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Historial
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
                        ) : movimientos.length === 0 ? (
                            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                                No hay movimientos para este período.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-[13px]">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {["Fecha", "Producto", "Tipo", "Cantidad", "Costo U.", "Costo Total", "Referencia"].map((h) => (
                                                <th key={h} className="px-3 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
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
                                                    <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{m.fecha}</td>
                                                    <td className="px-3 py-2.5 text-foreground max-w-[120px] truncate">
                                                        {prod?.nombre ?? m.productoId}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium ${tipoBadgeClass(m.tipo as TipoMovimiento)}`}>
                                                            {tipoLabel(m.tipo as TipoMovimiento)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.cantidad)}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">{fmtN(m.costoUnitario)}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.costoTotal)}</td>
                                                    <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-[100px] truncate">{m.referencia || "—"}</td>
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
