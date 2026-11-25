"use client";

// Screen: exchange difference of foreign currency collected at the counter.
// Imports the «I.G.T.F. Percibido» report (one row per day), derives the
// dollars of each day from the IGTF base and the BCV rate of the date, and
// values them at the BCV rate of the month close.

import { useEffect, useMemo, useRef, useState } from "react";
import { DollarSign, Download, Landmark, Receipt, TrendingUp, Upload } from "lucide-react";
import { decimalToFixed, exactDecimal } from "@kontave/monetary/domain";
import { salesDate } from "@kontave/sales/domain";
import {
    BuildForeignCurrencyCollectionsExchangeDifferenceReport,
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
    downloadForeignCurrencyCollectionsWorkbook,
    readIgtfPerceptionWorkbook,
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
    const [openMonth, setOpenMonth] = useState<string | null>(null);
    const [calculation, setCalculation] = useState<{
        lines: readonly ForeignCurrencyCollectionLine[];
        asOf: string;
        report: ForeignCurrencyCollectionsExchangeDifferenceReport | null;
    } | null>(null);

    const lines = useMemo<ForeignCurrencyCollectionLine[]>(() => collections.map((item) => {
        const override = rateOverrides[item.reference];
        return {
            reference: item.reference,
            collectedOn: salesDate(item.collectedOn),
            bookedVes: exactDecimal(item.bookedVes),
            ...(item.igtfVes ? { igtfVes: exactDecimal(item.igtfVes) } : {}),
            ...(override ? { vesPerUsd: exactDecimal(override) } : {}),
        };
    }), [collections, rateOverrides]);

    // The last calculation is kept with its inputs, so a recalculation shows the
    // previous figures until the new ones arrive.
    useEffect(() => {
        if (!lines.length || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return;
        let cancelled = false;
        new BuildForeignCurrencyCollectionsExchangeDifferenceReport(rates.current)
            .execute(lines, salesDate(asOf))
            .then((report) => { if (!cancelled) setCalculation({ lines, asOf, report }); })
            .catch((error) => {
                if (cancelled) return;
                notify.failure(error, "No se pudo calcular el diferencial cambiario.");
                setCalculation((current) => ({ lines, asOf, report: current?.report ?? null }));
            });
        return () => { cancelled = true; };
    }, [lines, asOf]);
    const report = lines.length ? calculation?.report ?? null : null;
    const loading = lines.length > 0 && (calculation?.lines !== lines || calculation.asOf !== asOf);

    async function handleFile(file: File | undefined) {
        if (!file) return;
        try {
            const result = await readIgtfPerceptionWorkbook(file);
            setCollections(result.items);
            setHeading(result.heading);
            setRateOverrides({});
            setOpenMonth(null);
            result.warnings.forEach((warning) => notify.warning(warning));
            if (result.items.length) notify.success(`${result.items.length} días con cobros en divisas importados.`);
        } catch (error) {
            notify.failure(error, "No se pudo leer el informe de IGTF.");
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
                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2 md:col-span-2">
                            <FieldLabel>Informe de IGTF percibido</FieldLabel>
                            <input ref={fileInput} type="file" accept=".xls,.xlsx" className="hidden" onChange={(event) => { void handleFile(event.target.files?.[0]); event.target.value = ""; }} />
                            <BaseButton.Root variant="secondary" size="sm" fullWidth leftIcon={<Upload size={14} strokeWidth={2} />} onPress={() => fileInput.current?.click()}>
                                {collections.length ? `${collections.length} días · cambiar archivo` : "Importar informe de IGTF (.xls)"}
                            </BaseButton.Root>
                        </div>
                        <div>
                            <FieldLabel>Corte</FieldLabel>
                            <input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} className={INPUT_CLS} />
                        </div>
                    </div>
                    <p className="mt-4 font-sans text-[12px] leading-snug text-[var(--text-tertiary)]">
                        La base del IGTF es el equivalente en bolívares de las divisas cobradas cada día. Los dólares del día se obtienen dividiendo esa base entre la tasa BCV de la fecha
                        y se valoran a la tasa BCV vigente el último día del mes. El diferencial es el valor al cierre menos la base. Cada mes se calcula por separado: se asume que los dólares
                        se usan dentro del mes. Un mes que no ha terminado se cierra provisionalmente a la tasa del corte.
                    </p>
                </Panel>

                {!collections.length ? (
                    <div className="rounded-xl border border-dashed border-border-light bg-surface-1 px-5 py-16 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                        Importa el «Informe de I.G.T.F. Percibido» del sistema de facturación (una fila por día) para calcular el diferencial cambiario de los cobros en divisas.
                    </div>
                ) : !report ? (
                    <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">{loading ? "Consultando tasas BCV y calculando…" : "Sin datos."}</div>
                ) : (
                    <>
                        <div className="grid gap-4 md:grid-cols-4">
                            <StatTile label="Base IGTF" value={`Bs. ${fmt(report.totals.bookedVes)}`} sublabel={`${report.totals.days} días`} icon={Landmark} />
                            <StatTile label="IGTF percibido" value={`Bs. ${fmt(report.totals.igtfVes)}`} sublabel="Informativo" icon={Receipt} tone="muted" />
                            <StatTile label="Dólares cobrados" value={`$ ${fmt(report.totals.collectedUsd)}`} sublabel={failed ? `${failed} días con error` : "Base ÷ tasa BCV del día"} icon={DollarSign} tone={failed ? "warning" : "default"} />
                            <StatTile label="Diferencial neto" value={`Bs. ${fmt(String(net))}`} sublabel={`Pérdidas: Bs. ${fmt(report.totals.lossVes)}`} icon={TrendingUp} tone={net >= 0 ? "success" : "warning"} />
                        </div>

                        <Panel title="Resumen mensual" aside={loading ? "Recalculando…" : provisional ? "* Mes sin cerrar: tasa del corte" : "Clic en un mes para ver sus días"}>
                            <Table headers={["Mes", "Días", "Base IGTF", "IGTF", "USD", "Tasa cierre", "Valor al cierre", "Ganancia", "Pérdida", "Neto"]}>
                                {report.months.map((month) => (
                                    <tr key={month.month} onClick={() => setOpenMonth((current) => current === month.month ? null : month.month)}
                                        className={["border-b border-border-light/50 cursor-pointer hover:bg-surface-2", openMonth === month.month ? "bg-primary-500/5" : ""].join(" ")}>
                                        <Cell left>{monthLabel(month.month)}{month.provisional ? " *" : ""}</Cell>
                                        <Cell>{month.days}</Cell>
                                        <Cell>{fmt(month.bookedVes)}</Cell>
                                        <Cell>{fmt(month.igtfVes)}</Cell>
                                        <Cell>{fmt(month.collectedUsd)}</Cell>
                                        <Cell>{month.closingVesPerUsd ? fmt(month.closingVesPerUsd, 4) : "—"}</Cell>
                                        <Cell>{fmt(month.closingVes)}</Cell>
                                        <Cell tone="success">{fmt(month.gainVes)}</Cell>
                                        <Cell tone="warning">{fmt(month.lossVes)}</Cell>
                                        <Cell>{fmt(String(Number(month.gainVes) - Number(month.lossVes)))}</Cell>
                                    </tr>
                                ))}
                                <tr className="bg-surface-2/50 font-bold">
                                    <Cell left>Total</Cell>
                                    <Cell>{report.totals.days}</Cell>
                                    <Cell>{fmt(report.totals.bookedVes)}</Cell>
                                    <Cell>{fmt(report.totals.igtfVes)}</Cell>
                                    <Cell>{fmt(report.totals.collectedUsd)}</Cell>
                                    <Cell>{""}</Cell>
                                    <Cell>{fmt(report.totals.closingVes)}</Cell>
                                    <Cell tone="success">{fmt(report.totals.gainVes)}</Cell>
                                    <Cell tone="warning">{fmt(report.totals.lossVes)}</Cell>
                                    <Cell>{fmt(String(net))}</Cell>
                                </tr>
                            </Table>
                        </Panel>

                        <Panel title={openMonth ? `Detalle diario · ${monthLabel(openMonth)}` : "Detalle diario"} aside={
                            openMonth ? <BaseButton.Root variant="ghost" size="sm" onPress={() => setOpenMonth(null)}>Ver todos los meses</BaseButton.Root> : "Edita la tasa del día si el sistema usó otra"
                        }>
                            <Table headers={["Fecha", "Base IGTF", "IGTF", "Tasa del día", "USD", "Cierre", "Tasa cierre", "Valor al cierre", "Diferencial"]}>
                                {report.rows.filter((row) => !openMonth || row.line.collectedOn.startsWith(openMonth)).map((row) => {
                                    const reference = row.line.reference;
                                    const rateCell = (value: string) => (
                                        <td className="px-3 py-1.5"><EditableCell value={rateOverrides[reference] ?? value} placeholder="Tasa" onCommit={(next) => setRateOverrides((current) => withRate(current, reference, next))} /></td>
                                    );
                                    if (row.status === "failed") {
                                        return (
                                            <tr key={reference} className="border-b border-border-light/50">
                                                <Cell left>{formatDate(row.line.collectedOn)}</Cell>
                                                <Cell>{fmt(row.line.bookedVes)}</Cell>
                                                <Cell>{row.line.igtfVes ? fmt(row.line.igtfVes) : "—"}</Cell>
                                                {rateCell("")}
                                                <td colSpan={5} className="px-3 py-1.5 font-sans text-[12px] text-text-warning">{row.reason}</td>
                                            </tr>
                                        );
                                    }
                                    const v = row.valuation;
                                    const difference = Number(v.exchangeDifference);
                                    return (
                                        <tr key={reference} className="border-b border-border-light/50 hover:bg-surface-2">
                                            <Cell left>{formatDate(row.line.collectedOn)}{reference.includes("#") ? ` (${reference.split("#")[1]})` : ""}</Cell>
                                            <Cell>{fmt(row.line.bookedVes)}</Cell>
                                            <Cell>{row.line.igtfVes ? fmt(row.line.igtfVes) : "—"}</Cell>
                                            {rateCell(decimalToFixed(v.collection.vesPerUsd, 4))}
                                            <Cell>{fmt(v.collectedUsd)}</Cell>
                                            <Cell>{formatDate(v.closingDate)}</Cell>
                                            <Cell>{fmt(v.closingVesPerUsd, 4)}</Cell>
                                            <Cell>{fmt(v.closingVes)}</Cell>
                                            <Cell tone={difference < 0 ? "warning" : difference > 0 ? "success" : undefined}>{fmt(v.exchangeDifference)}</Cell>
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

function withRate(current: Record<string, string>, key: string, value: string): Record<string, string> {
    const normalized = value.trim().replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(normalized) || Number(normalized) <= 0) {
        const { [key]: _removed, ...rest } = current;
        return rest;
    }
    return { ...current, [key]: normalized };
}
