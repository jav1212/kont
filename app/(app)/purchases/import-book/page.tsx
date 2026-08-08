"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Upload, AlertTriangle, ChevronLeft } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import { notify } from "@/src/shared/frontend/notify";
import {
    normalizeRif,
    parsePurchaseBookExcel,
    roundMoney,
    type PurchaseBookParseResult,
} from "@/src/modules/purchases/frontend/utils/purchase-book-excel";
import { buildPurchaseBookNotes } from "@/src/modules/purchases/backend/domain/purchase-book-import";
import type { PurchaseInvoice } from "@/src/modules/purchases/backend/domain/purchase-invoice";

const money = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bcvRateCache = new Map<string, number | null>();

async function getBcvRateForDate(date: string): Promise<number | null> {
    if (bcvRateCache.has(date)) return bcvRateCache.get(date) ?? null;
    try {
        const response = await fetch(`/api/bcv/rate?date=${date}&code=USD`);
        const data = await response.json() as { rate?: number | string };
        const raw = typeof data.rate === "string" ? data.rate.replace(",", ".") : data.rate;
        const rate = typeof raw === "number" && Number.isFinite(raw) && raw > 0
            ? Math.round(raw * 10000) / 10000
            : null;
        bcvRateCache.set(date, rate);
        return rate;
    } catch {
        bcvRateCache.set(date, null);
        return null;
    }
}

export default function ImportBookPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const {
        suppliers, loadSuppliers, purchaseInvoices, loadPurchaseInvoices,
        saveSupplier, savePurchaseInvoice,
    } = usePurchases();
    const [parsed, setParsed] = useState<PurchaseBookParseResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [done, setDone] = useState(0);

    useEffect(() => {
        if (!companyId) return;
        loadSuppliers(companyId);
        loadPurchaseInvoices(companyId);
    }, [companyId, loadSuppliers, loadPurchaseInvoices]);

    const supplierByRif = useMemo(() => new Map(
        suppliers.map((supplier) => [normalizeRif(supplier.rif), supplier]),
    ), [suppliers]);

    const rows = useMemo(() => parsed?.rows ?? [], [parsed]);
    const readyRows = useMemo(() => rows.filter((row) => {
        const duplicate = purchaseInvoices.some((invoice) =>
            invoice.period === row.period &&
            invoice.date === row.date &&
            ((row.controlNumber && invoice.controlNumber === row.controlNumber) ||
                (row.documentNumber && invoice.invoiceNumber === row.documentNumber)),
        );
        const companyMatches = !parsed?.companyRif || normalizeRif(parsed.companyRif) === normalizeRif(companyId ?? "");
        return companyMatches && !row.warnings.length && !duplicate;
    }), [rows, purchaseInvoices, companyId, parsed?.companyRif]);

    async function handleFile(file?: File) {
        if (!file) return;
        setLoading(true);
        try {
            setParsed(await parsePurchaseBookExcel(file));
        } catch (error) {
            notify.error(error instanceof Error ? error.message : "No se pudo leer el XLSX");
            setParsed(null);
        } finally {
            setLoading(false);
        }
    }

    async function importRows() {
        if (!companyId || !parsed || readyRows.length === 0) return;
        setImporting(true);
        setDone(0);

        const uniqueDates = [...new Set(readyRows.map((row) => row.date).filter(Boolean))];
        await Promise.all(uniqueDates.map((date) => getBcvRateForDate(date)));
        let imported = 0;
        for (const row of readyRows) {
            const supplier = supplierByRif.get(normalizeRif(row.supplierRif)) ?? await saveSupplier({
                companyId,
                rif: row.supplierRif,
                name: row.supplierName,
                contact: "", phone: "", email: "", address: "", notes: "", active: true,
            });
            if (!supplier?.id) continue;
            const invoice: PurchaseInvoice = {
                companyId,
                supplierId: supplier.id,
                documentType: row.documentType,
                invoiceNumber: row.documentNumber,
                controlNumber: row.controlNumber,
                date: row.date,
                period: row.period,
                periodoManual: true,
                status: "borrador",
                inventoryEffect: row.documentType === "factura" ? "additional_purchase" : "none",
                subtotal: roundMoney(row.exempt + row.taxableBase),
                vatPercentage: row.vatRate,
                vatAmount: roundMoney(row.vatAmount),
                total: roundMoney(row.total),
                dollarRate: await getBcvRateForDate(row.date),
                rateDecimals: 4,
                notes: buildPurchaseBookNotes(row, parsed.fileName),
                // Retention is intentionally not used in the product reconciliation.
                retencionIvaPct: 0,
                retencionIvaMonto: 0,
            };
            const saved = await savePurchaseInvoice(invoice, []);
            if (saved) imported += 1;
            setDone((value) => value + 1);
        }
        setImporting(false);
        notify.success(`${imported} factura${imported === 1 ? "" : "s"} precargada${imported === 1 ? "" : "s"}`);
        router.push("/inventory/compras-pendientes");
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Importar libro de compras" subtitle="Precarga fiscal antes de registrar productos">
                <BaseButton.Root as={Link} href="/purchases" variant="secondary" size="sm" leftIcon={<ChevronLeft size={14} />}>Volver</BaseButton.Root>
            </PageHeader>

            <div className="px-4 sm:px-6 py-6 max-w-6xl mx-auto space-y-5">
                <div className="rounded-xl border border-border-light bg-surface-1 p-5 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
                    <div>
                        <p className="text-[12px] font-bold uppercase tracking-[0.14em]">Carga el XLSX de la contable</p>
                        <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-1">Se crearan borradores. No se generan movimientos ni asientos hasta confirmar con productos.</p>
                    </div>
                    <label className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-primary-500 text-white text-[11px] uppercase tracking-[0.12em] cursor-pointer hover:bg-primary-600">
                        <Upload size={14} /> Seleccionar XLSX
                        <input className="hidden" type="file" accept=".xlsx,.xls" onChange={(event) => handleFile(event.target.files?.[0])} />
                    </label>
                </div>

                {loading && <div className="rounded-xl border border-border-light bg-surface-1 p-8 text-center text-[12px] text-[var(--text-tertiary)]">Leyendo archivo...</div>}

                {parsed && !loading && (
                    <>
                        <div className="rounded-xl border border-border-light bg-surface-1 p-4 grid grid-cols-2 md:grid-cols-5 gap-4 text-[12px]">
                            <div><p className="text-[10px] uppercase text-[var(--text-tertiary)]">Archivo</p><p className="mt-1 truncate">{parsed.fileName}</p></div>
                            <div><p className="text-[10px] uppercase text-[var(--text-tertiary)]">RIF detectado</p><p className="mt-1">{parsed.companyRif || "Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½aÃ¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½"}</p></div>
                            <div><p className="text-[10px] uppercase text-[var(--text-tertiary)]">Periodo</p><p className="mt-1">{parsed.period || "-"}</p></div>
                            <div><p className="text-[10px] uppercase text-[var(--text-tertiary)]">Periodo</p><p className="mt-1">{parsed.period || "-"}</p></div>
                            <div><p className="text-[10px] uppercase text-[var(--text-tertiary)]">Listas para precargar</p><p className="mt-1 font-bold text-emerald-600">{readyRows.length}</p></div>
                        </div>

                        {(parsed.errors.length > 0 || (parsed.companyRif && normalizeRif(parsed.companyRif) !== normalizeRif(companyId ?? ""))) && <div className="rounded-xl border border-red-300/50 bg-red-50 dark:bg-red-950/20 p-4 text-[12px] text-red-700">{[...parsed.errors, ...(parsed.companyRif && normalizeRif(parsed.companyRif) !== normalizeRif(companyId ?? "") ? ["El RIF del archivo no corresponde a la empresa seleccionada"] : [])].join(" Ã¯Â¿Â½Ã¯Â¿Â½aÃ¯Â¿Â½Ã¯Â¿Â½ ")}</div>}

                        <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-[11px]">
                                    <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]"><tr>
                                        <th className="text-left p-3">Op.</th><th className="text-left p-3">Fecha</th><th className="text-left p-3">Proveedor</th><th className="text-left p-3">Factura / Control</th><th className="text-right p-3">Total</th><th className="text-left p-3">Estado</th>
                                    </tr></thead>
                                    <tbody>{rows.map((row) => {
                                        const duplicate = purchaseInvoices.some((invoice) => invoice.period === row.period && invoice.date === row.date && ((row.controlNumber && invoice.controlNumber === row.controlNumber) || (row.documentNumber && invoice.invoiceNumber === row.documentNumber)));
                                        const reasons = [...row.warnings, duplicate ? "Factura duplicada en el mismo periodo" : ""].filter(Boolean);
                                        return <tr key={`${row.sourceRow}-${row.operation}`} className="border-t border-border-light/70">
                                            <td className="p-3 tabular-nums">{row.operation}</td><td className="p-3 tabular-nums">{row.date || "Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½aÃ¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½Ã¯Â¿Â½"}</td><td className="p-3 min-w-[220px]">{row.supplierName}<span className="block text-[10px] text-[var(--text-tertiary)]">{row.supplierRif}</span></td><td className="p-3 tabular-nums">{row.documentNumber}<span className="block text-[10px] text-[var(--text-tertiary)]">{row.controlNumber}</span></td><td className="p-3 text-right tabular-nums">Bs. {money(row.total)}</td><td className="p-3">{reasons.length === 0 ? <span className="text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={13} /> Lista</span> : <span className="text-amber-600 inline-flex items-center gap-1" title={reasons.join(" Ã¯Â¿Â½Ã¯Â¿Â½aÃ¯Â¿Â½Ã¯Â¿Â½ ")}><AlertTriangle size={13} /> Revisar</span>}</td>
                                        </tr>;
                                    })}</tbody>
                                </table>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[11px] text-[var(--text-tertiary)]"><FileSpreadsheet size={14} className="inline mr-1" />Las filas con datos fiscales incompletos o duplicadas en el mismo periodo no se importan.</p>
                            <BaseButton.Root variant="primary" size="md" disabled={importing || readyRows.length === 0} onClick={importRows}>
                                {importing ? `Precargando ${done}/${readyRows.length}...` : `Precargar ${readyRows.length} factura${readyRows.length === 1 ? "" : "s"}`}
                            </BaseButton.Root>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
