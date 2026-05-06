"use client";

// Page: NuevaFacturaQuickPage
// Flujo rápido de registro de factura de compra: solo header (proveedor +
// fecha + total declarado + retenciones opcionales), sin items detallados.
// Genera asiento contable y entra al libro de compras al confirmar. Los items
// se imputan después desde /inventory/compras-pendientes.
//
// Para el flujo completo (con items por producto) hay que ir a /purchases/new.

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, CheckCircle2, FileText, Info, ArrowRight, Plus, X } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import { notify } from "@/src/shared/frontend/notify";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import type { PurchaseInvoice } from "@/src/modules/purchases/backend/domain/purchase-invoice";
import { SupplierCombobox } from "@/src/modules/purchases/frontend/components/supplier-combobox";

const fmt = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const labelCls = "font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] mb-1.5 block";

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-default bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500 hover:border-border-medium transition-colors duration-150",
].join(" ");

export default function NuevaFacturaQuickPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { suppliers, loadSuppliers, savePurchaseInvoice, confirmPurchaseInvoice, saveSupplier } = usePurchases();

    const [supplierId, setSupplierId] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [controlNumber, setControlNumber] = useState("");
    const [date, setDate] = useState(getTodayIsoDate());
    const [subtotalStr, setSubtotalStr] = useState("");
    const [ivaPctStr, setIvaPctStr] = useState("16");
    const [retencionIvaPctStr, setRetencionIvaPctStr] = useState("0");
    const [notes, setNotes] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState<{ invoiceId: string } | null>(null);

    const [qcOpen, setQcOpen] = useState(false);
    const [qcSupplier, setQcSupplier] = useState({ name: "", rif: "" });
    const [qcSaving, setQcSaving] = useState(false);

    async function handleQcSupplier() {
        if (!qcSupplier.name.trim()) {
            notify.error("El nombre es requerido");
            return;
        }
        setQcSaving(true);
        const saved = await saveSupplier({
            companyId: companyId!,
            name: qcSupplier.name.trim(),
            rif: qcSupplier.rif.trim(),
            contact: "",
            phone: "",
            email: "",
            address: "",
            notes: "",
            active: true,
        });
        setQcSaving(false);
        if (saved) {
            setSupplierId(saved.id!);
            setQcOpen(false);
            setQcSupplier({ name: "", rif: "" });
        }
    }

    useEffect(() => {
        if (companyId) loadSuppliers(companyId);
    }, [companyId, loadSuppliers]);

    const subtotal = parseFloat(subtotalStr) || 0;
    const ivaPct   = parseFloat(ivaPctStr) || 0;
    const retIvaPct = Math.min(100, Math.max(0, parseFloat(retencionIvaPctStr) || 0));
    const ivaMonto = Math.round(subtotal * ivaPct) / 100;
    const retIvaMonto = Math.round(ivaMonto * retIvaPct) / 100;
    const total = subtotal + ivaMonto - retIvaMonto;

    const supplierName = useMemo(
        () => suppliers.find((s) => s.id === supplierId)?.name ?? "",
        [suppliers, supplierId],
    );

    function validate(): boolean {
        if (!companyId) { notify.error("Selecciona una empresa"); return false; }
        if (!supplierId) { notify.error("Selecciona un proveedor"); return false; }
        if (!invoiceNumber.trim()) { notify.error("Ingresa el número de factura"); return false; }
        if (!date) { notify.error("Ingresa la fecha"); return false; }
        if (subtotal <= 0) { notify.error("El subtotal debe ser mayor a 0"); return false; }
        return true;
    }

    async function handleSubmit() {
        if (!validate()) return;
        setSubmitting(true);

        const invoice: PurchaseInvoice = {
            companyId: companyId!,
            supplierId,
            invoiceNumber: invoiceNumber.trim(),
            controlNumber: controlNumber.trim(),
            date,
            period: date.slice(0, 7),
            status: "borrador",
            subtotal,
            vatPercentage: ivaPct,
            vatAmount: ivaMonto,
            total,
            notes: notes.trim(),
            retencionIvaPct: retIvaPct,
            retencionIvaMonto: retIvaMonto,
        };

        const saved = await savePurchaseInvoice(invoice, []);
        if (!saved?.id) {
            setSubmitting(false);
            return;
        }
        const confirmed = await confirmPurchaseInvoice(saved.id);
        setSubmitting(false);
        if (confirmed?.id) {
            setDone({ invoiceId: confirmed.id });
        }
    }

    if (done) {
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <PageHeader title="Registro rápido" subtitle="Factura contabilizada">
                    <span className="inline-flex items-center gap-1 px-2 h-6 rounded-md border badge-success font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                        <CheckCircle2 size={10} strokeWidth={2.5} />
                        Confirmada
                    </span>
                </PageHeader>

                <div className="px-8 py-10 flex justify-center">
                    <div className="w-full max-w-xl rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-border-light bg-emerald-50 dark:bg-emerald-950/30 flex items-start gap-3">
                            <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" strokeWidth={2} />
                            <div>
                                <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    Listo
                                </h2>
                                <p className="text-[12px] text-[var(--text-secondary)] font-sans leading-snug mt-1">
                                    Asiento contable y libro de compras actualizados. El stock de inventario se moverá cuando imputes los productos de la factura.
                                </p>
                            </div>
                        </div>

                        <dl className="px-6 py-4 space-y-2.5 text-[13px]">
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Proveedor</dt>
                                <dd className="text-foreground truncate max-w-[60%] text-right">{supplierName || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Nº Factura</dt>
                                <dd className="text-foreground tabular-nums">{invoiceNumber}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Fecha</dt>
                                <dd className="text-foreground tabular-nums">{date}</dd>
                            </div>
                            <div className="flex justify-between gap-3 pt-2 border-t border-border-light">
                                <dt className="text-foreground uppercase tracking-[0.14em] text-[11px] font-bold">Total</dt>
                                <dd className="text-foreground tabular-nums font-bold text-[16px]">Bs. {fmt(total)}</dd>
                            </div>
                        </dl>

                        <div className="px-6 py-4 border-t border-border-light flex items-center gap-3 flex-wrap">
                            <BaseButton.Root
                                as={Link}
                                href="/purchases"
                                variant="secondary"
                                size="md"
                            >
                                Ver facturas
                            </BaseButton.Root>
                            <BaseButton.Root
                                as={Link}
                                href={`/inventory/compras-pendientes/${done.invoiceId}`}
                                variant="primary"
                                size="md"
                                rightIcon={<ArrowRight size={14} strokeWidth={2} />}
                                className="ml-auto"
                            >
                                Imputar productos ahora
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Registro rápido"
                subtitle="Solo header — sin detalle de productos"
            >
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    leftIcon={<ChevronLeft size={14} strokeWidth={2} />}
                    onClick={() => router.back()}
                >
                    Volver
                </BaseButton.Root>
            </PageHeader>

            <div className="px-6 py-6 max-w-3xl mx-auto space-y-5">
                {/* Tutorial inline */}
                <div className="flex items-start gap-3 rounded-xl border border-border-light bg-surface-1 px-4 py-3">
                    <Info size={16} className="text-[var(--text-tertiary)] mt-0.5 shrink-0" strokeWidth={2} />
                    <div className="space-y-1">
                        <p className="font-sans text-[12px] text-foreground leading-snug">
                            Registra la factura ahora con proveedor y total. Se contabiliza y entra al libro de compras de inmediato. Los productos se imputan después en{" "}
                            <Link href="/inventory/compras-pendientes" className="text-primary-500 hover:underline">
                                Inventario → Compras pendientes
                            </Link>
                            .
                        </p>
                        <p className="font-sans text-[11px] text-[var(--text-tertiary)] leading-snug">
                            ¿Tienes el detalle a la mano? Usa el{" "}
                            <Link href="/purchases/new" className="text-primary-500 hover:underline">
                                flujo completo
                            </Link>
                            {" "}en su lugar.
                        </p>
                    </div>
                </div>

                {/* Datos del proveedor */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-bold">
                        1. Proveedor y factura
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>Proveedor</label>
                            <div className="flex gap-2">
                                <SupplierCombobox
                                    supplierId={supplierId}
                                    suppliers={suppliers}
                                    onChange={setSupplierId}
                                    onRequestCreate={(search) => {
                                        setQcSupplier({ name: search, rif: "" });
                                        setQcOpen(true);
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => { setQcSupplier({ name: "", rif: "" }); setQcOpen(true); }}
                                    className="h-10 w-10 shrink-0 rounded-lg border border-border-default bg-surface-1 hover:bg-surface-2 hover:border-border-medium text-[var(--text-tertiary)] hover:text-foreground transition-colors flex items-center justify-center"
                                    title="Crear nuevo proveedor"
                                    aria-label="Crear nuevo proveedor"
                                >
                                    <Plus size={14} strokeWidth={2} />
                                </button>
                            </div>
                            {suppliers.length === 0 && (
                                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                                    No hay proveedores.{" "}
                                    <Link href="/purchases/suppliers" className="text-primary-500 hover:underline">
                                        Ver listado
                                    </Link>
                                </p>
                            )}
                        </div>
                        <BaseInput.Field
                            label="Nº de factura"
                            value={invoiceNumber}
                            onValueChange={setInvoiceNumber}
                            placeholder="00012345"
                        />
                        <BaseInput.Field
                            label="Nº de control"
                            value={controlNumber}
                            onValueChange={setControlNumber}
                            placeholder="(opcional)"
                        />
                        <BaseInput.Field
                            label="Fecha"
                            type="date"
                            value={date}
                            onValueChange={setDate}
                        />
                    </div>
                </div>

                {/* Totales */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] font-bold">
                        2. Totales declarados
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <BaseInput.Field
                            label="Subtotal (Bs)"
                            type="number"
                            min={0}
                            step={0.01}
                            value={subtotalStr}
                            onValueChange={setSubtotalStr}
                            placeholder="0.00"
                            inputClassName="text-right"
                        />
                        <BaseInput.Field
                            label="IVA %"
                            type="number"
                            min={0}
                            max={100}
                            step={0.01}
                            value={ivaPctStr}
                            onValueChange={setIvaPctStr}
                            inputClassName="text-right"
                        />
                        <BaseInput.Field
                            label="Retención IVA %"
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            value={retencionIvaPctStr}
                            onValueChange={setRetencionIvaPctStr}
                            inputClassName="text-right"
                        />
                    </div>

                    <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border-light">
                        <div>
                            <p className={labelCls}>IVA</p>
                            <p className="font-mono text-[13px] text-foreground tabular-nums font-bold">
                                Bs. {fmt(ivaMonto)}
                            </p>
                        </div>
                        <div>
                            <p className={labelCls}>Retención IVA</p>
                            <p className="font-mono text-[13px] text-foreground tabular-nums font-bold">
                                Bs. {fmt(retIvaMonto)}
                            </p>
                        </div>
                        <div>
                            <p className={labelCls}>Total a pagar</p>
                            <p className="font-mono text-[16px] text-foreground tabular-nums font-bold">
                                Bs. {fmt(total)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Notas */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-5">
                    <label className={labelCls}>Notas</label>
                    <textarea
                        className={`${fieldCls} h-auto py-2 font-sans`}
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="(opcional)"
                    />
                </div>

                {/* CTA */}
                <div className="flex items-center justify-end gap-3">
                    <BaseButton.Root
                        variant="secondary"
                        size="md"
                        onClick={() => router.back()}
                    >
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        variant="primary"
                        size="md"
                        leftIcon={<FileText size={14} strokeWidth={2} />}
                        disabled={submitting}
                        onClick={handleSubmit}
                    >
                        {submitting ? "Confirmando…" : "Registrar y contabilizar"}
                    </BaseButton.Root>
                </div>
            </div>

            {qcOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-[440px] max-h-[85vh] overflow-y-auto bg-surface-1 rounded-xl border border-border-medium shadow-2xl p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[14px] font-bold uppercase tracking-[0.14em] text-foreground">Nuevo Proveedor</h3>
                            <button
                                onClick={() => setQcOpen(false)}
                                className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                                aria-label="Cerrar"
                            >
                                <X size={14} strokeWidth={2} />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <BaseInput.Field
                                autoFocus
                                label="Nombre *"
                                value={qcSupplier.name}
                                onValueChange={(v) => setQcSupplier((s) => ({ ...s, name: v }))}
                                placeholder="Nombre del proveedor"
                                onKeyDown={(e) => { if (e.key === "Enter") handleQcSupplier(); }}
                            />
                            <BaseInput.Field
                                label="RIF"
                                value={qcSupplier.rif}
                                onValueChange={(v) => setQcSupplier((s) => ({ ...s, rif: v }))}
                                placeholder="J-12345678-9"
                            />
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => setQcOpen(false)}
                                    className="flex-1 h-9 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleQcSupplier}
                                    disabled={qcSaving}
                                    className="flex-1 h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    {qcSaving ? "Guardando…" : "Crear proveedor"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
