"use client";

// Page: IGTF Quincenal — vista del agregado del IGTF percibido en una
// quincena específica + descarga del PDF de respaldo (Forma 99021).

import { useEffect, useState } from "react";
import { Receipt, Download } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useSales } from "@/src/modules/sales/frontend/hooks/use-sales";
import { generateIgtfFortnightlyPdf } from "@/src/modules/sales/frontend/utils/igtf-fortnightly-pdf";
import { IGTF_CONCEPTS, IGTF_CONCEPT_LABELS, type IgtfConcept } from "@/src/modules/sales/backend/domain/sales-invoice";
import type { IgtfFortnightlyReport } from "@/src/modules/sales/frontend/hooks/use-sales";
import { notify } from "@/src/shared/frontend/notify";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
    { v: 1, l: "Enero" }, { v: 2, l: "Febrero" }, { v: 3, l: "Marzo" }, { v: 4, l: "Abril" },
    { v: 5, l: "Mayo" }, { v: 6, l: "Junio" }, { v: 7, l: "Julio" }, { v: 8, l: "Agosto" },
    { v: 9, l: "Septiembre" }, { v: 10, l: "Octubre" }, { v: 11, l: "Noviembre" }, { v: 12, l: "Diciembre" },
];

export default function IgtfFortnightlyPage() {
    const { companyId, company } = useCompany();
    const { fetchIgtfFortnightly } = useSales();

    const today = new Date();
    const [year, setYear]         = useState(today.getFullYear());
    const [month, setMonth]       = useState(today.getMonth() + 1);
    const [quincena, setQuincena] = useState<1 | 2>(today.getDate() <= 15 ? 1 : 2);
    const [report, setReport]     = useState<IgtfFortnightlyReport | null>(null);
    const [loading, setLoading]   = useState(false);
    const [generating, setGenerating] = useState(false);

    const fmtDate = (d: string) => {
        if (!d) return "—";
        const [y, m, day] = d.split("-");
        return `${day}/${m}/${y}`;
    };

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        setLoading(true);
        fetchIgtfFortnightly(companyId, year, month, quincena).then(({ data, error }) => {
            if (cancelled) return;
            if (error) notify.error(error);
            setReport(data);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [companyId, year, month, quincena, fetchIgtfFortnightly]);

    async function handleDownloadPdf() {
        if (!report || !company) return;
        if (!company.rif) { notify.error("La empresa no tiene RIF configurado."); return; }
        setGenerating(true);
        try {
            await generateIgtfFortnightlyPdf(report, {
                name:    company.name,
                rif:     company.rif,
                address: company.address,
            });
            notify.success("PDF de IGTF quincenal generado.");
        } catch (e) {
            notify.error(e instanceof Error ? e.message : "Error al generar PDF");
        } finally {
            setGenerating(false);
        }
    }

    const totalIgtf = report?.totalIgtfBs ?? 0;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="IGTF Quincenal" subtitle="Forma 99021 · PA SNAT/2022/000013">
                {report && totalIgtf > 0 && (
                    <BaseButton.Root variant="primary" size="sm" leftIcon={<Download size={14} strokeWidth={2} />} onClick={handleDownloadPdf} disabled={generating}>
                        {generating ? "Generando…" : "Descargar PDF"}
                    </BaseButton.Root>
                )}
            </PageHeader>

            <div className="px-8 py-6 space-y-6">
                {/* Selector */}
                <div className="rounded-xl border border-border-light bg-surface-1 p-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">Año</label>
                            <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))}
                                className="w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground tabular-nums focus:border-primary-500/60">
                                {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">Mes</label>
                            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}
                                className="w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground focus:border-primary-500/60">
                                {MONTHS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] block mb-1">Quincena</label>
                            <div className="inline-flex rounded-lg border border-border-light bg-surface-1 overflow-hidden h-9 w-full">
                                {([1, 2] as const).map((q, i) => (
                                    <button key={q} type="button" onClick={() => setQuincena(q)}
                                        className={["flex-1 px-3 text-[11px] uppercase tracking-[0.12em] transition-colors", i > 0 ? "border-l border-border-light" : "", quincena === q ? "bg-primary-500/10 text-primary-500 font-bold" : "text-[var(--text-secondary)] hover:bg-surface-2"].join(" ")}>
                                        {q === 1 ? "1ª (1-15)" : "2ª (16-fin)"}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {report && (
                        <div className="mt-4 pt-4 border-t border-border-light flex items-center justify-between text-[11px] font-mono uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                            <span>Rango: <span className="text-foreground tabular-nums normal-case tracking-normal">{fmtDate(report.dateStart)} → {fmtDate(report.dateEnd)}</span></span>
                            <span>Agente: <span className="text-foreground tabular-nums normal-case tracking-normal">{report.agentRif}</span></span>
                        </div>
                    )}
                </div>

                {/* Detalle por concepto */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">Detalle por concepto</h2>
                        <span className="text-[11px] uppercase tracking-[0.12em] text-info tabular-nums">
                            Total IGTF: Bs. {fmtN(totalIgtf)}
                        </span>
                    </div>

                    {loading ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">Calculando…</div>
                    ) : !report ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">Sin datos.</div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-border-light bg-surface-2/50">
                                    {["Concepto", "Operaciones", "Base Imp. Bs.", "IGTF Bs."].map((h, i) => (
                                        <th key={i} className={["px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap", i === 0 ? "text-left" : "text-right"].join(" ")}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {IGTF_CONCEPTS.map((concepto) => {
                                    const stat = report.byConcept[concepto as IgtfConcept];
                                    const empty = !stat || stat.operationCount === 0;
                                    return (
                                        <tr key={concepto} className={["border-b border-border-light/50", empty ? "" : "hover:bg-surface-2"].join(" ")}>
                                            <td className={["px-4 py-2.5 whitespace-nowrap", empty ? "text-[var(--text-tertiary)]" : "text-foreground font-medium"].join(" ")}>
                                                {IGTF_CONCEPT_LABELS[concepto]}
                                            </td>
                                            <td className={["px-4 py-2.5 tabular-nums text-right", empty ? "text-[var(--text-tertiary)]" : "text-foreground"].join(" ")}>
                                                {stat?.operationCount ?? 0}
                                            </td>
                                            <td className={["px-4 py-2.5 tabular-nums text-right", empty ? "text-[var(--text-tertiary)]" : "text-[var(--text-secondary)]"].join(" ")}>
                                                {fmtN(stat?.baseAmountBs ?? 0)}
                                            </td>
                                            <td className={["px-4 py-2.5 tabular-nums text-right font-medium", empty ? "text-[var(--text-tertiary)]" : "text-info"].join(" ")}>
                                                {fmtN(stat?.igtfAmountBs ?? 0)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-info/40 bg-info/[0.04]">
                                    <td className="px-4 py-3 text-[11px] uppercase tracking-[0.12em] font-bold text-foreground">Total a enterar</td>
                                    <td colSpan={2} />
                                    <td className="px-4 py-3 tabular-nums text-right text-[14px] font-bold text-info whitespace-nowrap">
                                        Bs. {fmtN(totalIgtf)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>

                <div className="px-4 py-3 rounded-lg border border-info/20 bg-info/[0.05] text-[11px] font-sans text-[var(--text-tertiary)] flex items-start gap-2 leading-snug">
                    <Receipt size={14} strokeWidth={2} className="text-info mt-0.5 shrink-0" />
                    <span>
                        Este reporte agrega solo el IGTF <strong>percibido en facturas de venta confirmadas</strong> de la quincena. Si tu empresa también percibió IGTF por otras vías, súmalo manualmente al llenar la Forma 99021 en el portal SENIAT.
                    </span>
                </div>
            </div>
        </div>
    );
}
