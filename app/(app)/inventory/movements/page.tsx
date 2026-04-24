"use client";

// Page: Ajustes y Devoluciones (inventory adjustments and returns)
// Architectural role: UI page for registering manual inventory movements (adjustments, returns, autoconsumo).
// All identifiers use English domain types from backend/domain/movement and backend/domain/product.

import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { Movement } from "@/src/modules/inventory/backend/domain/movement";
import type { MovementType } from "@/src/modules/inventory/backend/domain/movement";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function isoToday() { return getTodayIsoDate(); }
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

function tipoBadgeClass(type: MovementType): string {
    if (["entrada","entrada_produccion","devolucion_salida"].includes(type))
        return "border badge-success";
    if (["salida","salida_produccion","devolucion_entrada"].includes(type))
        return "border badge-error";
    if (type === "autoconsumo") return "border border-amber-500/40 text-amber-500 bg-amber-500/[0.06]";
    if (type === "ajuste_positivo") return "border badge-warning";
    return "border badge-warning";
}

function tipoLabel(type: MovementType) {
    const all = [...TIPO_GROUPS.flatMap((g) => g.items), { value: "autoconsumo", label: "Autoconsumo" }];
    return all.find((i) => i.value === type)?.label ?? type;
}

// ── Local form shape (extends Movement with UI-only currency fields) ──────────

interface MovementFormState {
    companyId: string;
    productId: string;
    type: MovementType;
    date: string;
    period: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    balanceQuantity: number;
    reference: string;
    notes: string;
    currency: 'B' | 'D';
    currencyCost: number;
}

interface AutoconsumoFormState {
    productId: string;
    quantity: number;
    date: string;
    notes: string;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function MovementsPage() {
    const { companyId } = useCompany();
    const {
        products, movements,
        loadingMovements, error, setError,
        loadProducts, loadMovements, saveMovement,
        loadPeriodCloses, currentDollarRate,
    } = useInventory();

    const [period, setPeriod] = useState(currentPeriod());
    const [saving, setSaving] = useState(false);
    const [dollarRateStr, setDollarRateStr] = useState<string>("");
    const [bcvLoading, setBcvLoading] = useState(false);
    const [bcvDate, setBcvDate] = useState<string | null>(null);
    const [bcvError, setBcvError] = useState<string | null>(null);

    // ── main form state ──────────────────────────────────────────────────────
    const emptyForm = (): MovementFormState => ({
        companyId:     companyId ?? "",
        productId:     "",
        type:          "entrada" as MovementType,
        date:          isoToday(),
        period:        currentPeriod(),
        quantity:      0,
        unitCost:      0,
        totalCost:     0,
        balanceQuantity: 0,
        reference:     "",
        notes:         "",
        currency:      "B",
        currencyCost:  0,
    });

    const [form, setForm] = useState<MovementFormState>(emptyForm());

    // ── autoconsumo form state ───────────────────────────────────────────────
    const emptyAcForm = (): AutoconsumoFormState => ({ productId: "", quantity: 0, date: isoToday(), notes: "" });
    const [acForm, setAcForm] = useState<AutoconsumoFormState>(emptyAcForm());
    const [acStep, setAcStep] = useState<"form" | "confirm">("form");
    const [acSaving, setAcSaving] = useState(false);

    const acProduct = useMemo(
        () => products.find((p) => p.id === acForm.productId),
        [acForm.productId, products],
    );
    const acTotalCost = acProduct ? acForm.quantity * acProduct.averageCost : 0;
    const acVat       = acProduct?.vatType === "general" ? acTotalCost * 0.16 : 0;
    const acStockOk   = !acProduct || acForm.quantity <= acProduct.currentStock;

    // ── effects ──────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!companyId) return;
        loadProducts(companyId);
        loadMovements(companyId, period);
        loadPeriodCloses(companyId);
    }, [companyId, loadProducts, loadMovements, loadPeriodCloses, period]);

    // Pre-fill dollar rate from last period close
    useEffect(() => {
        if (currentDollarRate != null && dollarRateStr === "") {
            setDollarRateStr(String(currentDollarRate));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDollarRate]);

    // Auto-fetch BCV rate when form date changes
    useEffect(() => {
        if (!form.date) return;
        let cancelled = false;
        setBcvLoading(true);
        setBcvDate(null);
        setBcvError(null);
        fetch(`/api/bcv/rate?date=${form.date}&code=USD`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                if (json.rate) {
                    setDollarRateStr(String(json.rate));
                    setBcvDate(json.date);
                } else {
                    setBcvError(json.error ?? 'Sin datos BCV para esta fecha');
                    setBcvDate(null);
                }
            })
            .catch(() => { if (!cancelled) { setBcvError('Error al consultar BCV'); setBcvDate(null); } })
            .finally(() => { if (!cancelled) setBcvLoading(false); });
        return () => { cancelled = true; };
    }, [form.date]);

    // Pre-fill unit cost when product changes (main form)
    useEffect(() => {
        if (!form.productId) return;
        const product = products.find((x) => x.id === form.productId);
        if (!product) return;
        setForm((f) => ({
            ...f,
            currency:  'B',
            unitCost:  product.averageCost,
            currencyCost: 0,
            companyId: companyId ?? "",
        }));
    }, [form.productId, products, companyId]);

    const dollarRate = useMemo(() => {
        const v = parseFloat(dollarRateStr.replace(",", "."));
        return isNaN(v) || v <= 0 ? null : v;
    }, [dollarRateStr]);

    const effectiveUnitCost = useMemo(() => {
        if (form.currency === 'D' && form.currencyCost > 0 && dollarRate) {
            return Math.round(form.currencyCost * dollarRate * 10000) / 10000;
        }
        return form.unitCost;
    }, [form.currency, form.currencyCost, form.unitCost, dollarRate]);

    const computedTotalCost = useMemo(() =>
        form.quantity * effectiveUnitCost,
    [form.quantity, effectiveUnitCost]);

    // ── main form handlers ───────────────────────────────────────────────────
    function setF<K extends keyof MovementFormState>(k: K, v: MovementFormState[K]) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    async function handleSave() {
        if (!form.productId) { setError("Selecciona un producto"); return; }
        if (!form.quantity || form.quantity <= 0) { setError("La cantidad debe ser mayor a 0"); return; }
        setSaving(true);
        const product = products.find((p) => p.id === form.productId);
        const movement: Movement = {
            ...form,
            companyId:      companyId!,
            unitCost:       effectiveUnitCost,
            totalCost:      computedTotalCost,
            balanceQuantity: 0,
            period:         form.date.slice(0, 7),
            currentStock:   product?.currentStock,
            currency:       form.currency,
            currencyCost:   form.currency === 'D' ? form.currencyCost : undefined,
            dollarRate:     form.currency === 'D' ? dollarRate : undefined,
        };
        const saved = await saveMovement(movement);
        setSaving(false);
        if (saved) {
            setForm(emptyForm());
            loadMovements(companyId!, period);
        }
    }

    // ── autoconsumo handlers ─────────────────────────────────────────────────
    function setAc<K extends keyof AutoconsumoFormState>(k: K, v: AutoconsumoFormState[K]) {
        setAcForm((f) => ({ ...f, [k]: v }));
    }

    function handleAcPreview() {
        if (!acForm.productId) { setError("Selecciona un producto para el autoconsumo"); return; }
        if (!acForm.quantity || acForm.quantity <= 0) { setError("La cantidad debe ser mayor a 0"); return; }
        if (!acStockOk) {
            setError(`Stock insuficiente. Existencia actual: ${fmtN(acProduct!.currentStock)}`);
            return;
        }
        setError(null);
        setAcStep("confirm");
    }

    async function handleAcConfirm() {
        if (!acProduct) return;
        setAcSaving(true);
        const movement: Movement = {
            companyId:      companyId!,
            productId:      acForm.productId,
            type:           "autoconsumo",
            date:           acForm.date,
            period:         acForm.date.slice(0, 7),
            quantity:       acForm.quantity,
            unitCost:       acProduct.averageCost,
            totalCost:      acTotalCost,
            balanceQuantity: 0,
            reference:      "",
            notes:          acForm.notes,
            currentStock:   acProduct.currentStock,
        };
        const saved = await saveMovement(movement);
        setAcSaving(false);
        if (saved) {
            setAcForm(emptyAcForm());
            setAcStep("form");
            loadMovements(companyId!, period);
            loadProducts(companyId!);
        }
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Ajustes y Devoluciones"
                subtitle="Correcciones de inventario y devoluciones — entradas en Entradas · salidas en Salidas"
            />

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
                            <BaseInput.Field
                                type="number"
                                min={0}
                                step={0.0001}
                                className="w-36"
                                value={dollarRateStr}
                                onValueChange={(v) => { setDollarRateStr(v); setBcvDate(null); }}
                                placeholder={bcvLoading ? 'Consultando…' : 'Ej. 46.50'}
                                isDisabled={bcvLoading}
                            />
                            {bcvLoading && <span className="text-[11px] text-[var(--text-tertiary)] animate-pulse">···</span>}
                            {bcvDate && !bcvLoading && <span className="text-[11px] text-green-500 uppercase tracking-[0.12em]">BCV {bcvDate}</span>}
                            {bcvError && !bcvLoading && <span className="text-[11px] text-amber-500">{bcvError}</span>}
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className={labelCls}>Producto *</label>
                                <select
                                    className={fieldCls}
                                    value={form.productId}
                                    onChange={(e) => setF("productId", e.target.value)}
                                >
                                    <option value="">Seleccionar…</option>
                                    {products.filter((p) => p.active).map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {p.code ? `[${p.code}] ` : ""}{p.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className={labelCls}>Tipo *</label>
                                <select
                                    className={fieldCls}
                                    value={form.type}
                                    onChange={(e) => setF("type", e.target.value as MovementType)}
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

                            <BaseInput.Field
                                label="Fecha"
                                type="date"
                                value={form.date}
                                onValueChange={(v) => setF("date", v)}
                            />

                            <BaseInput.Field
                                label="Cantidad *"
                                type="number"
                                min={0.0001}
                                step={0.0001}
                                value={form.quantity ? String(form.quantity) : ""}
                                onValueChange={(v) => setF("quantity", parseFloat(v) || 0)}
                            />


                            <div>
                                <label className={labelCls}>Moneda</label>
                                <select
                                    className={fieldCls}
                                    value={form.currency}
                                    onChange={(e) => setF("currency", e.target.value as 'B' | 'D')}
                                >
                                    <option value="B">Bolívares (Bs)</option>
                                    <option value="D">Dólares (USD)</option>
                                </select>
                            </div>

                            {form.currency === 'D' ? (
                                <div>
                                    <BaseInput.Field
                                        label="Costo USD"
                                        type="number"
                                        min={0}
                                        step={0.0001}
                                        prefix="$"
                                        value={form.currencyCost ? String(form.currencyCost) : ""}
                                        onValueChange={(v) => setF("currencyCost", parseFloat(v) || 0)}
                                        placeholder="Costo en dólares"
                                    />
                                    {dollarRate && form.currencyCost > 0 && (
                                        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">
                                            = {fmtN(form.currencyCost * dollarRate)} Bs
                                            {" "}(tasa {fmtN(dollarRate)} Bs/USD)
                                        </p>
                                    )}
                                    {!dollarRate && (
                                        <p className="mt-1 text-[11px] text-amber-500">
                                            Ingresa la tasa BCV para calcular el costo en Bs
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <BaseInput.Field
                                    label="Costo unitario (Bs)"
                                    type="number"
                                    min={0}
                                    step={0.0001}
                                    prefix="Bs."
                                    value={form.unitCost ? String(form.unitCost) : ""}
                                    onValueChange={(v) => setF("unitCost", parseFloat(v) || 0)}
                                />
                            )}

                            <BaseInput.Field
                                label="Costo total Bs (calculado)"
                                type="text"
                                isDisabled
                                prefix="Bs."
                                value={fmtN(computedTotalCost)}
                                onValueChange={() => {}}
                            />

                            <BaseInput.Field
                                label="Referencia"
                                type="text"
                                value={form.reference}
                                onValueChange={(v) => setF("reference", v)}
                                placeholder="Nro. factura, orden, etc."
                            />

                            <BaseInput.Field
                                label="Notas"
                                type="text"
                                value={form.notes}
                                onValueChange={(v) => setF("notes", v)}
                            />
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
                                        value={acForm.productId}
                                        onChange={(e) => setAc("productId", e.target.value)}
                                    >
                                        <option value="">Seleccionar…</option>
                                        {products.filter((p) => p.active).map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.code ? `[${p.code}] ` : ""}{p.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Product info */}
                                {acProduct && (
                                    <div className="grid grid-cols-2 gap-2 px-3 py-2.5 rounded-lg bg-surface-2 border border-border-light">
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-0.5">Costo promedio</p>
                                            <p className="text-[12px] tabular-nums text-foreground">{fmtN(acProduct.averageCost)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-0.5">IVA tipo</p>
                                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium border ${
                                                acProduct.vatType === "general"
                                                    ? "border-primary-500/30 text-primary-500 bg-primary-500/[0.06]"
                                                    : "border-border-light text-[var(--text-tertiary)]"
                                            }`}>
                                                {acProduct.vatType === "general" ? "16% General" : "Exento"}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-0.5">Existencia actual</p>
                                            <p className={`text-[12px] tabular-nums ${acForm.quantity > acProduct.currentStock && acForm.quantity > 0 ? "text-red-500" : "text-foreground"}`}>
                                                {fmtN(acProduct.currentStock)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <BaseInput.Field
                                    label="Fecha"
                                    type="date"
                                    value={acForm.date}
                                    onValueChange={(v) => setAc("date", v)}
                                />

                                <div>
                                    <BaseInput.Field
                                        label="Cantidad a retirar *"
                                        type="number"
                                        min={0.0001}
                                        step={0.0001}
                                        value={acForm.quantity ? String(acForm.quantity) : ""}
                                        onValueChange={(v) => setAc("quantity", parseFloat(v) || 0)}
                                    />
                                    {!acStockOk && acForm.quantity > 0 && (
                                        <p className="mt-1 text-[11px] text-red-500">
                                            Supera la existencia disponible
                                        </p>
                                    )}
                                </div>

                                <BaseInput.Field
                                    label="Motivo / Notas"
                                    type="text"
                                    value={acForm.notes}
                                    onValueChange={(v) => setAc("notes", v)}
                                    placeholder="Ej. Uso interno, muestra, pérdida…"
                                />

                                {/* IVA preview */}
                                {acProduct && acForm.quantity > 0 && (
                                    <div className="px-3 py-3 rounded-lg border border-border-light bg-surface-2 space-y-1.5">
                                        <p className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] mb-2">Preview</p>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Costo retirado</span>
                                            <span className="tabular-nums text-foreground">{fmtN(acTotalCost)}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className={acVat > 0 ? "text-amber-500" : "text-[var(--text-secondary)]"}>
                                                IVA 16% {acProduct.vatType === "exento" ? "(exento)" : "débito fiscal"}
                                            </span>
                                            <span className={`tabular-nums font-medium ${acVat > 0 ? "text-amber-500" : "text-[var(--text-secondary)]"}`}>
                                                {fmtN(acVat)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-[12px] pt-1.5 border-t border-border-light">
                                            <span className="font-bold text-foreground">Total impacto</span>
                                            <span className="tabular-nums font-bold text-foreground">{fmtN(acTotalCost + acVat)}</span>
                                        </div>
                                    </div>
                                )}

                                <div className="pt-1">
                                    <button
                                        onClick={handleAcPreview}
                                        disabled={!acForm.productId || !acForm.quantity || !acStockOk}
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
                                            <span className="text-foreground font-medium">{acProduct?.name}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Cantidad</span>
                                            <span className="tabular-nums text-foreground">{fmtN(acForm.quantity)}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Costo unitario</span>
                                            <span className="tabular-nums text-foreground">{fmtN(acProduct?.averageCost ?? 0)}</span>
                                        </div>
                                        <div className="flex justify-between text-[12px]">
                                            <span className="text-[var(--text-secondary)]">Costo total retirado</span>
                                            <span className="tabular-nums text-foreground">{fmtN(acTotalCost)}</span>
                                        </div>
                                        {acForm.notes && (
                                            <div className="flex justify-between text-[12px]">
                                                <span className="text-[var(--text-secondary)]">Motivo</span>
                                                <span className="text-foreground max-w-[140px] truncate text-right">{acForm.notes}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* IVA highlight */}
                                    <div className="mt-3 pt-3 border-t border-amber-500/20 space-y-1.5">
                                        <div className="flex justify-between items-center text-[12px]">
                                            <span className="text-amber-500 font-bold uppercase tracking-[0.10em] text-[12px]">
                                                Débito fiscal IVA 16%
                                            </span>
                                            <span className={`tabular-nums font-bold text-[15px] ${acVat > 0 ? "text-amber-500" : "text-[var(--text-secondary)]"}`}>
                                                {fmtN(acVat)}
                                            </span>
                                        </div>
                                        {acVat === 0 && (
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
                                <BaseInput.Field
                                    type="month"
                                    className="w-40"
                                    value={period}
                                    onValueChange={setPeriod}
                                />
                            </div>
                        </div>

                        {loadingMovements ? (
                            <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                        ) : movements.length === 0 ? (
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
                                        {movements.map((m) => {
                                            const prod = products.find((p) => p.id === m.productId);
                                            return (
                                                <tr key={m.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                                    <td className="px-3 py-2.5 text-[var(--text-secondary)] whitespace-nowrap">{m.date}</td>
                                                    <td className="px-3 py-2.5 text-foreground max-w-[120px] truncate">
                                                        {prod?.name ?? m.productId}
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium ${tipoBadgeClass(m.type)}`}>
                                                            {tipoLabel(m.type)}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.quantity)}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-[var(--text-secondary)]">{fmtN(m.unitCost)}</td>
                                                    <td className="px-3 py-2.5 tabular-nums text-foreground">{fmtN(m.totalCost)}</td>
                                                    <td className="px-3 py-2.5 text-[var(--text-secondary)] max-w-[100px] truncate">{m.reference || "—"}</td>
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
