"use client";

// Purchase invoices list page (Facturas de Compra).
// Lists all purchase invoices with status, and provides:
//   - Inline edit of fecha + tasa BCV + decimales (borrador AND confirmada).
//     For confirmadas we orchestrate unconfirm → save → confirm so stock
//     movements stay in sync with the new rate.
//   - Delete (with confirmation).

import { useEffect, useMemo, useState } from "react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { InvoiceStatus, PurchaseInvoice, PurchaseInvoiceItem } from "@/src/modules/inventory/backend/domain/purchase-invoice";
import {
    BcvRateInput,
    DEFAULT_RATE_DECIMALS,
    parseRateStr,
    roundRateValue,
    useBcvRate,
} from "@/src/modules/inventory/frontend/components/bcv-rate-input";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

function StatusBadge({ status }: { status: InvoiceStatus }) {
    if (status === "confirmada") {
        return (
            <span className="inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium badge-success">
                Confirmada
            </span>
        );
    }
    return (
        <span className="inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium badge-warning">
            Borrador
        </span>
    );
}

/**
 * Apply a new BCV rate to an item list, recomputing unitCost/totalCost for
 * every `currency='D'` line. Bs lines are returned untouched. Mirrors the
 * formula used in factura-items-grid (round4 unitCost, round2 totalCost).
 */
function recomputeItemsForRate(
    items: PurchaseInvoiceItem[],
    rate: number | null,
): PurchaseInvoiceItem[] {
    if (rate == null) return items.map((i) => ({ ...i }));
    return items.map((item) => {
        if (item.currency !== "D" || item.currencyCost == null) return { ...item };
        const unitCost  = round4(item.currencyCost * rate);
        const totalCost = round2(item.quantity * unitCost);
        return { ...item, unitCost, totalCost, dollarRate: rate };
    });
}

/** Totals for the preview row inside the modal. Matches the derivation used
 *  in the create/edit forms (per-item IVA alícuota). */
function computeTotals(items: PurchaseInvoiceItem[]) {
    const subtotal    = items.reduce((acc, i) => acc + (i.totalCost ?? 0), 0);
    const base8       = items.filter(i => (i.vatRate ?? "general_16") === "reducida_8").reduce((a, i) => a + i.totalCost, 0);
    const base16      = items.filter(i => (i.vatRate ?? "general_16") === "general_16").reduce((a, i) => a + i.totalCost, 0);
    const vat8        = round2(base8  * 8  / 100);
    const vat16       = round2(base16 * 16 / 100);
    const vatAmount   = vat8 + vat16;
    const total       = subtotal + vatAmount;
    return { subtotal, vatAmount, total };
}

// ── Edit modal ────────────────────────────────────────────────────────────────

interface EditModalProps {
    invoiceId: string;
    onClose: () => void;
    onSaved: () => void;
}

function EditRateModal({ invoiceId, onClose, onSaved }: EditModalProps) {
    const {
        currentPurchaseInvoice,
        loadPurchaseInvoice,
        savePurchaseInvoice,
        confirmPurchaseInvoice,
        unconfirmPurchaseInvoice,
        loadingPurchaseInvoice,
    } = useInventory();

    const {
        rate: dollarRateStr,
        decimals: rateDecimals,
        setRateFromApi,
        setRateTyped,
        applyDecimals,
    } = useBcvRate();

    const [date, setDate] = useState<string>("");
    const [loaded, setLoaded] = useState(false);
    const [rateLoading, setRateLoading] = useState(false);
    const [bcvDate, setBcvDate] = useState<string | null>(null);
    const [bcvError, setBcvError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Fetch invoice once
    useEffect(() => {
        loadPurchaseInvoice(invoiceId);
    }, [invoiceId, loadPurchaseInvoice]);

    // Hydrate local state once the invoice finishes loading. Guards against
    // hydrating with a stale `currentPurchaseInvoice` left over from a prior
    // detail-page visit while the fresh fetch is still in flight.
    useEffect(() => {
        if (loaded) return;
        if (loadingPurchaseInvoice) return;
        if (!currentPurchaseInvoice || currentPurchaseInvoice.id !== invoiceId) return;
        const inv = currentPurchaseInvoice;
        setDate(inv.date);
        const storedDecimals = inv.rateDecimals ?? DEFAULT_RATE_DECIMALS;
        const storedRate     = inv.dollarRate ?? null;
        if (storedRate != null) {
            setRateFromApi(storedRate, storedDecimals);
        }
        if (inv.rateDecimals != null && inv.rateDecimals !== DEFAULT_RATE_DECIMALS) {
            applyDecimals(storedDecimals);
        }
        setLoaded(true);
    }, [currentPurchaseInvoice, loadingPurchaseInvoice, invoiceId, loaded, setRateFromApi, applyDecimals]);

    // Auto-fetch BCV on the selected date (initial hydration + any date change).
    // The stored rate shown during hydration acts as a fallback if the API
    // call fails; on success it's replaced with the fresh BCV rate.
    useEffect(() => {
        if (!loaded || !date) return;
        let cancelled = false;
        setRateLoading(true);
        setBcvError(null);
        fetch(`/api/bcv/rate?date=${date}&code=USD`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                if (json.rate) {
                    setRateFromApi(json.rate, rateDecimals);
                    setBcvDate(json.date);
                } else {
                    setBcvError(json.error ?? "Sin datos BCV para esta fecha");
                    setBcvDate(null);
                }
            })
            .catch(() => { if (!cancelled) setBcvError("Error al consultar BCV"); })
            .finally(() => { if (!cancelled) setRateLoading(false); });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, loaded]);

    // Preview: recompute what totals will look like after saving
    const preview = useMemo(() => {
        if (!currentPurchaseInvoice?.items) return null;
        const parsed = parseRateStr(dollarRateStr);
        const effectiveRate = isFinite(parsed) ? roundRateValue(parsed, rateDecimals) : null;
        const items = recomputeItemsForRate(currentPurchaseInvoice.items, effectiveRate);
        return { ...computeTotals(items), effectiveRate, items };
    }, [currentPurchaseInvoice, dollarRateStr, rateDecimals]);

    const hasUsdItems = useMemo(
        () => (currentPurchaseInvoice?.items ?? []).some(i => i.currency === "D"),
        [currentPurchaseInvoice],
    );

    async function handleSave() {
        if (!currentPurchaseInvoice || !preview) return;
        setSaving(true);
        setSaveError(null);
        try {
            const wasConfirmed = currentPurchaseInvoice.status === "confirmada";
            let workingInvoice: PurchaseInvoice = currentPurchaseInvoice;

            if (wasConfirmed) {
                const u = await unconfirmPurchaseInvoice(invoiceId);
                if (!u) { setSaveError("No se pudo desconfirmar la factura"); setSaving(false); return; }
                workingInvoice = u;
            }

            const saved = await savePurchaseInvoice(
                {
                    ...workingInvoice,
                    date,
                    period: date.slice(0, 7),
                    dollarRate:   preview.effectiveRate,
                    rateDecimals,
                },
                preview.items,
            );
            if (!saved) { setSaveError("No se pudo guardar la factura"); setSaving(false); return; }

            if (wasConfirmed) {
                const confirmed = await confirmPurchaseInvoice(saved.id!);
                if (!confirmed) { setSaveError("No se pudo reconfirmar la factura"); setSaving(false); return; }
            }

            onSaved();
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Error al recalcular");
        } finally {
            setSaving(false);
        }
    }

    const wasConfirmed = currentPurchaseInvoice?.status === "confirmada";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-surface-1 border border-border-medium rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Editar cálculo de factura
                    </h2>
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="w-7 h-7 flex items-center justify-center text-[var(--text-tertiary)] hover:text-foreground text-[16px] rounded disabled:opacity-40"
                    >
                        ×
                    </button>
                </div>

                {loadingPurchaseInvoice || !loaded || !currentPurchaseInvoice ? (
                    <div className="px-6 py-10 text-center text-[12px] text-[var(--text-tertiary)]">
                        Cargando factura…
                    </div>
                ) : (
                    <>
                        <div className="px-6 py-5 space-y-5">
                            {/* Header info */}
                            <div className="text-[12px] text-[var(--text-secondary)] space-y-0.5">
                                <p><span className="uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Proveedor:</span> {currentPurchaseInvoice.supplierName ?? "—"}</p>
                                <p><span className="uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Nº Factura:</span> {currentPurchaseInvoice.invoiceNumber || "—"}</p>
                                <p>
                                    <span className="uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Estado:</span>{" "}
                                    <StatusBadge status={currentPurchaseInvoice.status} />
                                </p>
                            </div>

                            {/* Fecha */}
                            <BaseInput.Field
                                label="Fecha del cálculo"
                                type="date"
                                value={date}
                                onValueChange={setDate}
                            />

                            {/* Tasa + decimales */}
                            <BcvRateInput
                                rate={dollarRateStr}
                                onRateChange={(v) => { setRateTyped(v); setBcvDate(null); }}
                                decimals={rateDecimals}
                                onDecimalsChange={applyDecimals}
                                loading={rateLoading}
                                bcvDate={bcvDate}
                                error={bcvError}
                            />

                            {!hasUsdItems && (
                                <div className="px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] text-[11px] text-amber-700">
                                    Esta factura no tiene ítems en USD — cambiar la tasa no afectará los totales.
                                </div>
                            )}

                            {/* Preview */}
                            {preview && (
                                <div className="rounded-lg border border-border-light bg-surface-2/50 px-4 py-3">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-2">
                                        Totales resultantes
                                    </p>
                                    <div className="grid grid-cols-3 gap-3 text-[12px]">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Subtotal</p>
                                            <p className="tabular-nums font-medium text-foreground">{fmtN(preview.subtotal)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">IVA</p>
                                            <p className="tabular-nums text-[var(--text-secondary)]">{fmtN(preview.vatAmount)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Total</p>
                                            <p className="tabular-nums font-bold text-foreground">{fmtN(preview.total)}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {wasConfirmed && (
                                <p className="text-[11px] text-amber-700 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-3 py-2">
                                    Esta factura está <strong>confirmada</strong>: guardar revertirá sus movimientos de inventario y los regenerará con la nueva tasa.
                                </p>
                            )}

                            {saveError && (
                                <div className="px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[12px]">
                                    {saveError}
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={onClose}
                                disabled={saving}
                            >
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="primary"
                                size="md"
                                onClick={handleSave}
                                disabled={saving || !preview}
                            >
                                {saving ? "Guardando…" : "Guardar cambios"}
                            </BaseButton.Root>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PurchaseInvoicesPage() {
    const { companyId } = useCompany();
    const {
        purchaseInvoices, loadingPurchaseInvoices, error, setError,
        loadPurchaseInvoices, deletePurchaseInvoice,
    } = useInventory();

    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [confirmDeleteConfirmada, setConfirmDeleteConfirmada] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        if (companyId) loadPurchaseInvoices(companyId);
    }, [companyId, loadPurchaseInvoices]);

    function requestDelete(id: string, status: string) {
        if (status === "confirmada") {
            setConfirmDeleteConfirmada(id);
        } else {
            setConfirmDelete(id);
        }
    }

    async function handleDelete(id: string) {
        setDeleting(true);
        await deletePurchaseInvoice(id);
        setDeleting(false);
        setConfirmDelete(null);
        setConfirmDeleteConfirmada(null);
    }

    function handleEditSaved() {
        setEditingId(null);
        if (companyId) loadPurchaseInvoices(companyId);
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Facturas de Compra" subtitle="Registro de compras a proveedores">
                <BaseButton.Root as={Link} href="/inventory/purchases" variant="secondary" size="sm">
                    ← Libro de entradas
                </BaseButton.Root>
                <BaseButton.Root as={Link} href="/inventory/purchases/new" variant="primary" size="sm">
                    + Nueva factura
                </BaseButton.Root>
            </PageHeader>

            {editingId && (
                <EditRateModal
                    invoiceId={editingId}
                    onClose={() => setEditingId(null)}
                    onSaved={handleEditSaved}
                />
            )}

            {/* Warning modal for deleting a confirmed invoice */}
            {confirmDeleteConfirmada && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-yellow-500/20 rounded-xl shadow-xl w-full max-w-lg mx-4">
                        <div className="px-6 py-4 border-b border-yellow-500/20 bg-yellow-500/[0.06] rounded-t-xl">
                            <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-yellow-600">
                                Advertencia: Factura confirmada
                            </h2>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-[14px] text-foreground leading-relaxed">
                                Eliminar una factura confirmada puede distorsionar el costo promedio del inventario si hubo movimientos posteriores a esta compra.
                                La práctica contable correcta es registrar una <strong>devolución de compra</strong>.
                            </p>
                            <p className="mt-3 text-[13px] text-yellow-600 font-medium">
                                ¿Deseas continuar de todas formas?
                            </p>
                        </div>
                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <BaseButton.Root
                                variant="secondary"
                                size="md"
                                onClick={() => { setConfirmDeleteConfirmada(null); setError(null); }}
                                disabled={deleting}
                            >
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root
                                variant="danger"
                                size="md"
                                onClick={() => handleDelete(confirmDeleteConfirmada)}
                                disabled={deleting}
                            >
                                {deleting ? "Eliminando…" : "Sí, eliminar"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-8 py-6 space-y-4">
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    {loadingPurchaseInvoices ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : purchaseInvoices.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                            No hay facturas. Haz clic en &quot;+ Nueva factura&quot; para crear una.
                        </div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["Fecha", "Proveedor", "Nº Factura", "Tasa", "Subtotal", "IVA", "Total", "Estado", "", ""].map((h, i) => (
                                        <th key={i} className="px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {purchaseInvoices.map((f) => (
                                    <tr key={f.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">{fmtDate(f.date)}</td>
                                        <td className="px-4 py-2.5 text-foreground font-medium">{f.supplierName ?? "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)]">{f.invoiceNumber || "—"}</td>
                                        <td className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">
                                            {f.dollarRate != null
                                                ? `${f.dollarRate.toLocaleString("es-VE", { maximumFractionDigits: f.rateDecimals ?? 2, minimumFractionDigits: f.rateDecimals ?? 2 })}`
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-2.5 tabular-nums text-[var(--text-primary)]">{fmtN(f.subtotal)}</td>
                                        <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">{fmtN(f.vatAmount)}</td>
                                        <td className="px-4 py-2.5 tabular-nums font-medium text-foreground">{fmtN(f.total)}</td>
                                        <td className="px-4 py-2.5"><StatusBadge status={f.status} /></td>
                                        <td className="px-4 py-2.5 whitespace-nowrap">
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setEditingId(f.id!)}
                                                    className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-primary-500 transition-colors"
                                                >
                                                    Editar
                                                </button>
                                                <Link
                                                    href={`/inventory/purchases/${f.id}`}
                                                    className="text-[11px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                                                >
                                                    Ver
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {confirmDelete === f.id ? (
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => handleDelete(f.id!)}
                                                        disabled={deleting}
                                                        className="text-[11px] uppercase tracking-[0.10em] text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                                                    >
                                                        {deleting ? "…" : "Confirmar"}
                                                    </button>
                                                    <span className="text-[var(--text-tertiary)]">·</span>
                                                    <button
                                                        onClick={() => { setConfirmDelete(null); setError(null); }}
                                                        className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => requestDelete(f.id!, f.status)}
                                                    className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                                                >
                                                    Eliminar
                                                </button>
                                            )}
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
