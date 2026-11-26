"use client";

// Screen: exchange difference of foreign currency collected and later paid out.
// Imports the «I.G.T.F. Percibido» report (one row per day, in Bs) or the
// collections template (sale date, days or receipt date, amount and currency),
// and values the dollars of each row at the BCV rate of the payment date.

import { useEffect, useMemo, useRef, useState } from "react";
import { DollarSign, Download, FileSpreadsheet, Landmark, Receipt, TrendingUp, Upload } from "lucide-react";
import { decimalToFixed, exactDecimal } from "@kontave/monetary/domain";
import { salesDate } from "@kontave/sales/domain";
import {
    BuildForeignCurrencyCollectionsExchangeDifferenceReport,
    DEFAULT_FOREIGN_CURRENCY_PAYMENT_TERM_DAYS,
    type ForeignCurrencyCollectionLine,
    type ForeignCurrencyCollectionsExchangeDifferenceReport,
} from "@kontave/sales/application";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { StatTile } from "@/src/shared/frontend/components/stat-tile";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { notify } from "@/src/shared/frontend/notify";
import { formatVes as fmt, monthLabel } from "@/src/modules/sales/shared/financed-sales-labels";
import { BcvUsdRateHistory } from "../financed-sales/bcv-usd-rate-history";
import { formatDate } from "../financed-sales/financed-sales-workbook";
import { Cell, EditableCell, FieldLabel, INPUT_CLS, Panel, Table } from "../financed-sales/financed-sales-ui";
import {
    downloadForeignCurrencyCollectionsTemplate,
    downloadForeignCurrencyCollectionsWorkbook,
    readForeignCurrencyCollectionsWorkbook,
    type IgtfReportHeading,
    type ImportedForeignCurrencyCollection,
} from "./foreign-currency-collections-workbook";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });

export function ForeignCurrencyCollectionsScreen() {
    const { company } = useCompany();
    const rates = useRef(new BcvUsdRateHistory());
    const fileInput = useRef<HTMLInputElement>(null);

    const [collections, setCollections] = useState<ImportedForeignCurrencyCollection[]>([]);
    const [heading, setHeading] = useState<IgtfReportHeading>({ company: null, period: null });
    const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({});
    const [asOf, setAsOf] = useState(today);
    const [termInput, setTermInput] = useState(String(DEFAULT_FOREIGN_CURRENCY_PAYMENT_TERM_DAYS));
    const [openMonth, setOpenMonth] = useState<string | null>(null);
    const [calculation, setCalculation] = useState<{
        lines: readonly ForeignCurrencyCollectionLine[];
        asOf: string;
        term: number;
        report: ForeignCurrencyCollectionsExchangeDifferenceReport | null;
    } | null>(null);

    const term = /^\d{1,3}$/.test(termInput) ? Number(termInput) : null;

    const lines = useMemo<ForeignCurrencyCollectionLine[]>(() => collections.map((item) => {
        const override = rateOverrides[item.reference] ?? item.vesPerUsd;
        return {
            reference: item.reference,
            collectedOn: salesDate(item.collectedOn),
            amount: exactDecimal(item.amount),
            currency: item.currency,
            ...(item.igtfVes ? { igtfVes: exactDecimal(item.igtfVes) } : {}),
            ...(item.paidOn ? { paidOn: salesDate(item.paidOn) } : {}),
            ...(override ? { vesPerUsd: exactDecimal(override) } : {}),
        };
    }), [collections, rateOverrides]);

    // The last calculation is kept with its inputs, so a recalculation shows the
    // previous figures until the new ones arrive.
    useEffect(() => {
        if (!lines.length || term === null || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return;
        let cancelled = false;
        new BuildForeignCurrencyCollectionsExchangeDifferenceReport(rates.current)
            .execute(lines, salesDate(asOf), term)
            .then((report) => { if (!cancelled) setCalculation({ lines, asOf, term, report }); })
            .catch((error) => {
                if (cancelled) return;
                notify.failure(error, "No se pudo calcular el diferencial cambiario.");
                setCalculation((current) => ({ lines, asOf, term, report: current?.report ?? null }));
            });
        return () => { cancelled = true; };
    }, [lines, asOf, term]);
    const report = lines.length ? calculation?.report ?? null : null;
    const loading = lines.length > 0 && (calculation?.lines !== lines || calculation.asOf !== asOf || calculation.term !== term);
    const usesTerm = collections.some((item) => !item.paidOn);

    async function handleFile(file: File | undefined) {
        if (!file) return;
        try {
            const result = await readForeignCurrencyCollectionsWorkbook(file);
            setCollections(result.items);
            setHeading(result.heading);
            setRateOverrides({});
            setOpenMonth(null);
            result.warnings.forEach((warning) => notify.warning(warning));
            if (result.items.length) notify.success(`${result.items.length} cobros en divisas importados.`);
        } catch (error) {
            notify.failure(error, "No se pudo leer el archivo.");
        }
    }

    function handleExport() {
        if (!report) return;
        const name = (company?.name ?? "empresa").replace(/[^\w-]+/g, "-").toLowerCase();
        downloadForeignCurrencyCollectionsWorkbook(report, heading, `diferencial-cambiario-divisas-${name}-${asOf}.xlsx`);
        notify.success("Reporte exportado a Excel.");
    }

    const net = report ? Number(report.totals.gainVes) - Number(report.totals.lossVes) : 0;
    const failed = report?.rows.filter((row) => row.status === "failed").length ?? 0;
    const provisional = report?.months.some((month) => month.provisional) ?? false;

    return (
        <div className="font-mono">
            <div className="px-8 py-6 space-y-6">
                {report && (
                    <div className="flex justify-end">
                        <BaseButton.Root variant="primary" size="sm" leftIcon={<Download size={14} strokeWidth={2} />} onPress={handleExport}>
                            Exportar Excel
                        </BaseButton.Root>
                    </div>
                )}
                <Panel title="Datos" aside={heading.period ?? undefined}>
                    <div className="grid gap-4 md:grid-cols-4">
                        <div className="space-y-2 md:col-span-2">
                            <FieldLabel>Cobros en divisas (plantilla o informe de IGTF)</FieldLabel>
                            <input ref={fileInput} type="file" accept=".xls,.xlsx" className="hidden" onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ""; }} />
                            <div className="flex gap-2">
                                <BaseButton.Root variant="secondary" size="sm" fullWidth leftIcon={<Upload size={14} strokeWidth={2} />} onPress={() => fileInput.current?.click()}>
                                    {collections.length ? `${collections.length} cobros · cambiar archivo` : "Importar Excel"}
                                </BaseButton.Root>
                                <BaseButton.Root variant="ghost" size="sm" leftIcon={<FileSpreadsheet size={14} strokeWidth={2} />} onPress={downloadForeignCurrencyCollectionsTemplate}>
                                    Plantilla
                                </BaseButton.Root>
                            </div>
                        </div>
                        <div>
                            <FieldLabel>Días hasta el pago</FieldLabel>
                            <input type="number" min={0} step={1} value={termInput} onChange={(event) => setTermInput(event.target.value)} className={INPUT_CLS} />
                        </div>
                        <div>
                            <FieldLabel>Corte</FieldLabel>
                            <input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={INPUT_CLS} />
                        </div>
                    </div>
                    <p className="mt-4 font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">
                        Las divisas se registran a la tasa BCV de la fecha de venta y se valoran a la tasa BCV de la fecha en que se recibieron o se usaron para pagar.
                        El diferencial es el valor al recibo menos el registrado y puede ser ganancia o pérdida. La plantilla indica por fila los días o la fecha de recibo y el monto en USD o Bs;
                        las filas sin ninguno de los dos y el informe de IGTF (montos en Bs) usan los días hasta el pago. Un recibo posterior al corte se valora provisionalmente a la tasa del corte.
                    </p>
                    {usesTerm && term === null && <p className="mt-2 font-sans text-[12px] text-text-warning">Indica los días hasta el pago como un número entero.</p>}
                </Panel>

                {!collections.length ? (
                    <div className="rounded-xl border border-dashed border-border-light bg-surface-1 px-5 py-16 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                        Descarga la plantilla y llénala con la fecha de venta, los días o la fecha de recibo y el monto con su moneda, o importa el «Informe de I.G.T.F. Percibido» del sistema de facturación.
                    </div>
                ) : !report ? (
                    <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">{loading ? "Consultando tasas BCV y calculando…" : "Sin datos."}</div>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-4">
                            <StatTile label="Registrado" value={`Bs. ${fmt(report.totals.bookedVes)}`} sublabel={`${report.totals.days} cobros`} icon={Landmark} />
                            <StatTile label="IGTF percibido" value={`Bs. ${fmt(report.totals.igtfVes)}`} sublabel="Informativo" icon={Receipt} tone="muted" />
                            <StatTile label="Dólares cobrados" value={`$ ${fmt(report.totals.collectedUsd)}`} sublabel={failed ? `${failed} cobros con error` : `Valor al recibo: Bs. ${fmt(report.totals.paymentVes)}`} icon={DollarSign} tone={failed ? "warning" : "default"} />
                            <StatTile label="Diferencial neto" value={`Bs. ${fmt(String(net))}`} sublabel={`${pct(report.totals.exchangeDifferencePercent)} del registrado · Pérdidas: Bs. ${fmt(report.totals.lossVes)}`} icon={TrendingUp} tone={net >= 0 ? "success" : "warning"} />
                        </div>

                        <Panel title="Resumen por mes de venta" aside={loading ? "Recalculando…" : provisional ? "* Incluye recibos posteriores al corte" : "Clic en un mes para ver sus cobros"}>
                            <Table headers={["Mes", "Cobros", "Registrado Bs", "IGTF", "USD", "Valor al recibo", "Ganancia", "Pérdida", "Neto", "%"]}>
                                {report.months.map((month) => (
                                    <tr key={month.month} onClick={() => setOpenMonth((current) => current === month.month ? null : month.month)}
                                        className={["border-b border-border-light/50 cursor-pointer hover:bg-surface-2", openMonth === month.month ? "bg-primary-500/5" : ""].join(" ")}>
                                        <Cell left>{monthLabel(month.month)}{month.provisional ? " *" : ""}</Cell>
                                        <Cell>{month.days}</Cell>
                                        <Cell>{fmt(month.bookedVes)}</Cell>
                                        <Cell>{fmt(month.igtfVes)}</Cell>
                                        <Cell>{fmt(month.collectedUsd)}</Cell>
                                        <Cell>{fmt(month.paymentVes)}</Cell>
                                        <Cell tone="success">{fmt(month.gainVes)}</Cell>
                                        <Cell tone="warning">{fmt(month.lossVes)}</Cell>
                                        <Cell>{fmt(String(Number(month.gainVes) - Number(month.lossVes)))}</Cell>
                                        <Cell>{pct(month.exchangeDifferencePercent)}</Cell>
                                    </tr>
                                ))}
                                <tr className="bg-surface-2/50 font-bold">
                                    <Cell left>Total</Cell>
                                    <Cell>{report.totals.days}</Cell>
                                    <Cell>{fmt(report.totals.bookedVes)}</Cell>
                                    <Cell>{fmt(report.totals.igtfVes)}</Cell>
                                    <Cell>{fmt(report.totals.collectedUsd)}</Cell>
                                    <Cell>{fmt(report.totals.paymentVes)}</Cell>
                                    <Cell tone="success">{fmt(report.totals.gainVes)}</Cell>
                                    <Cell tone="warning">{fmt(report.totals.lossVes)}</Cell>
                                    <Cell>{fmt(String(net))}</Cell>
                                    <Cell>{pct(report.totals.exchangeDifferencePercent)}</Cell>
                                </tr>
                            </Table>
                        </Panel>

                        <Panel title={openMonth ? `Detalle · ${monthLabel(openMonth)}` : "Detalle"} aside={
                            openMonth ? <BaseButton.Root variant="ghost" size="sm" onPress={() => setOpenMonth(null)}>Ver todos los meses</BaseButton.Root> : "Edita la tasa de venta si el sistema usó otra"
                        }>
                            <Table headers={["Fecha venta", "Monto", "Tasa venta", "USD", "Registrado Bs", "Fecha recibo", "Tasa recibo", "Valor al recibo", "Diferencial", "%"]}>
                                {report.rows.filter((row) => !openMonth || row.line.collectedOn.startsWith(openMonth)).map((row) => {
                                    const reference = row.line.reference;
                                    const amount = `${row.line.currency === "USD" ? "$" : "Bs."} ${fmt(row.line.amount)}`;
                                    const rateCell = (value: string) => (
                                        <td className="px-3 py-1.5"><EditableCell value={rateOverrides[reference] ?? value} placeholder="Tasa" onCommit={(next) => setRateOverrides((current) => withRate(current, reference, next))} /></td>
                                    );
                                    if (row.status === "failed") {
                                        return (
                                            <tr key={reference} className="border-b border-border-light/50">
                                                <Cell left>{formatDate(row.line.collectedOn)}</Cell>
                                                <Cell>{amount}</Cell>
                                                {rateCell("")}
                                                <td colSpan={7} className="px-3 py-1.5 font-sans text-[12px] text-text-warning">{row.reason}</td>
                                            </tr>
                                        );
                                    }
                                    const v = row.valuation;
                                    const difference = Number(v.exchangeDifference);
                                    return (
                                        <tr key={reference} className="border-b border-border-light/50 hover:bg-surface-2">
                                            <Cell left>{formatDate(row.line.collectedOn)}{reference.includes("#") ? ` (${reference.split("#")[1]})` : ""}</Cell>
                                            <Cell>{amount}</Cell>
                                            {rateCell(decimalToFixed(v.collection.vesPerUsd, 4))}
                                            <Cell>{fmt(v.collectedUsd)}</Cell>
                                            <Cell>{fmt(v.bookedVes)}</Cell>
                                            <Cell>{formatDate(v.paidOn)}{row.provisional ? ` * (${formatDate(row.scheduledPaidOn)})` : ""}</Cell>
                                            <Cell>{fmt(v.paymentVesPerUsd, 4)}</Cell>
                                            <Cell>{fmt(v.paymentVes)}</Cell>
                                            <Cell tone={difference < 0 ? "warning" : difference > 0 ? "success" : undefined}>{fmt(v.exchangeDifference)}</Cell>
                                            <Cell tone={difference < 0 ? "warning" : difference > 0 ? "success" : undefined}>{pct(v.exchangeDifferencePercent)}</Cell>
                                        </tr>
                                    );
                                })}
                            </Table>
                        </Panel>
                    </>
                )}
            </div>
        </div>
    );
}

function pct(value: string): string {
    return `${fmt(value)} %`;
}

function withRate(current: Record<string, string>, key: string, value: string): Record<string, string> {
    const normalized = value.trim().replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(normalized) || Number(normalized) <= 0) {
        const { [key]: _removed, ...rest } = current;
        return rest;
    }
    return { ...current, [key]: normalized };
}
