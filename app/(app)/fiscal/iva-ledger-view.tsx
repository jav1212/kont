"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { AlertTriangle, BookOpenCheck, Download, FileSearch, RefreshCcw } from "lucide-react";
import type { LegacyVatSourcePage, VatLedgerPage, VatPeriodSummary } from "@kontave/tax-reporting/application";
import type { TaxReportingFact } from "@kontave/tax-reporting/domain";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseCheckbox } from "@/src/shared/frontend/components/base-checkbox";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect } from "@/src/shared/frontend/components/base-select";
import { DocumentDrawer } from "@/src/modules/iva/frontend/components/document-drawer";
import { PeriodSelector } from "@/src/modules/iva/frontend/components/period-selector";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { formatIvaMoney } from "@/src/modules/iva/frontend/money-format";
import { ivaLabelOrPending } from "@/src/modules/iva/frontend/labels";
import { ivaRequest } from "@/src/modules/iva/frontend/iva-client";

type LedgerDirection = "purchase" | "sale";
type LedgerMode = "facts" | "sources";
type SerializedMoney = { readonly currency: { readonly code: string; readonly minorUnit: number }; readonly minorAmount: string | number | bigint };
type LedgerPayload = Omit<VatLedgerPage, "facts" | "rateGroups" | "withholdingGroups"> & {
  readonly facts: readonly (Omit<TaxReportingFact, "signed" | "deductible" | "rateBreakdowns" | "withholding"> & {
    readonly signed: { readonly taxableBase: SerializedMoney; readonly taxAmount: SerializedMoney; readonly exemptBase: SerializedMoney; readonly total: SerializedMoney };
    readonly deductible: { readonly amount: SerializedMoney; readonly state: "eligible" | "ineligible" | "pending_review" };
    readonly rateBreakdowns: readonly { readonly rate: string; readonly category: string; readonly taxableBase: SerializedMoney; readonly taxAmount: SerializedMoney; readonly component?: string }[];
    readonly withholding: { readonly kind: "practiced" | "suffered"; readonly amount: SerializedMoney; readonly certificateReference: string | null; readonly occurredAt: string } | null;
  })[];
  readonly rateGroups: readonly { readonly rate: string; readonly category: string; readonly taxableBase: SerializedMoney; readonly taxAmount: SerializedMoney; readonly component?: string; readonly ruleVersion: string | null }[];
  readonly withholdingGroups: readonly { readonly kind: "practiced" | "suffered"; readonly amount: SerializedMoney }[];
};

/** Renders a read-only, company-scoped IVA book and legacy source-review view.
 * @param props - Book direction and human-facing title.
 * @returns A paginated fiscal book with explicit unavailable and review states.
 */
export function IvaLedgerView({ direction, title, initialMode = "facts" }: { readonly direction: LedgerDirection; readonly title: string; readonly initialMode?: LedgerMode }): React.JSX.Element {
  const { companyId } = useCompany();
  const searchParams = useSearchParams();
  const router = useRouter();
  const periodParam = searchParams.get("periodo");
  const period = periodParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodParam) ? periodParam : currentPeriod();
  const [mode, setMode] = useState<LedgerMode>(initialMode);
  const [ledger, setLedger] = useState<LedgerPayload | null>(null);
  const [sources, setSources] = useState<LegacyVatSourcePage | null>(null);
  const [summary, setSummary] = useState<VatPeriodSummary | null>(null);
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [fortnight, setFortnight] = useState(searchParams.get("quincena") ?? "all");
  const [selectedFact, setSelectedFact] = useState<LedgerPayload["facts"][number] | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => periodRange(period), [period]);
  const setPeriod = (nextPeriod: string) => {
    const query = new URLSearchParams(searchParams.toString());
    query.set("periodo", nextPeriod);
    router.replace(`?${query.toString()}`);
  };
  const endpoint = mode === "facts"
    ? `/api/fiscal/iva/${direction === "purchase" ? "purchase-ledger" : "sales-ledger"}`
    : `/api/fiscal/iva/legacy-${direction === "purchase" ? "purchase" : "sales"}-sources`;

  const load = useCallback(async (cursor: string | null = null) => {
    if (!companyId) {
      setLedger(null);
      setSources(null);
      return;
    }
    if (cursor === null) {
      setLedger(null);
      setSources(null);
    }
    setLoading(true);
    setError(null);
    try {
      let currentCursor = cursor
      let result: LedgerPayload | LegacyVatSourcePage | null = null
      const collectAll = mode === "facts" && cursor === null && (search.trim().length > 0 || fortnight !== "all")
      do {
        const params = new URLSearchParams({ companyId, from: range.from, to: range.to, period, limit: "100" })
        if (currentCursor) params.set("cursor", currentCursor)
        const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" })
        const body: unknown = await response.json()
        if (!response.ok) {
          const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
            ? body.error : "No fue posible consultar el libro de IVA."
          throw new Error(message)
        }
        if (typeof body !== "object" || body === null || !("data" in body)) throw new Error("Respuesta del libro no valida.")
        const page = body.data as LedgerPayload | LegacyVatSourcePage
        if (mode === "facts") {
          const factPage = page as LedgerPayload
          result = result && "facts" in result
            ? { ...factPage, facts: [...result.facts, ...factPage.facts] }
            : factPage
          currentCursor = collectAll && factPage.nextCursor ? JSON.stringify(factPage.nextCursor) : null
        } else {
          result = page
          currentCursor = null
        }
      } while (currentCursor)
      if (mode === "facts") setLedger(result as LedgerPayload | null)
      else setSources(result as LegacyVatSourcePage | null)    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible consultar el libro de IVA.");
      setLedger(null);
      setSources(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, endpoint, mode, period, range.from, range.to, search, fortnight]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    if (!companyId) { setSummary(null); return () => { active = false; }; }
    const params = new URLSearchParams({ companyId, period });
    void ivaRequest<VatPeriodSummary>(`/api/fiscal/iva/period-summary?${params}`)
      .then((value) => { if (active) setSummary(value); })
      .catch(() => { if (active) setSummary(null); });
    return () => { active = false; };
  }, [companyId, period]);

  async function exportPeriod(format: "csv" | "xlsx" | "pdf"): Promise<void> {
    if (!companyId || exporting) return;
    setExporting(true);
    try {
      const exportFacts: LedgerPayload["facts"][number][] = [];
      let cursor: NonNullable<LedgerPayload["nextCursor"]> | null = null;
      do {
        const params = new URLSearchParams({ companyId, period, from: range.from, to: range.to, limit: "100" });
        if (cursor) params.set("cursor", JSON.stringify(cursor));
        const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(responseError(body));
        const page = (body as { data: LedgerPayload }).data;
        exportFacts.push(...page.facts);
        cursor = page.nextCursor;
      } while (cursor);
      if (!exportFacts.length) throw new Error("No hay documentos fiscales guardados para exportar.");
      const rows = exportFacts.map((fact, index) => ({
        "N.º operación": index + 1, Fecha: fact.documentDate, RIF: fact.counterparty.taxIdentifier ?? "", Contraparte: fact.counterparty.name ?? "",
        Documento: fact.source.id, Tipo: ivaLabelOrPending(fact.documentKind), "Factura afectada": fact.affectedFactId ?? "",
        Conciliación: ivaLabelOrPending(fact.reconciliation.state), Exento: formatIvaMoney(fact.signed.exemptBase),
        Base: formatIvaMoney(fact.signed.taxableBase), IVA: formatIvaMoney(fact.signed.taxAmount),
        Retención: fact.withholding ? formatIvaMoney(fact.withholding.amount) : "",
        "Comprobante retención": fact.withholding?.certificateReference ?? "",
      }));
      if (format === "csv") {
        const headers = Object.keys(rows[0]!);
        const content = [headers, ...rows.map((row) => headers.map((header) => row[header as keyof typeof row]))].map((values) => values.map(csvCell).join(";")).join("\r\n");
        downloadFile(`libro-iva-${direction}-${period}.csv`, new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
      } else if (format === "xlsx") {
        const xlsx = await import("xlsx");
        const book = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet(rows), "Libro IVA");
        xlsx.writeFile(book, `libro-iva-${direction}-${period}.xlsx`);
      } else {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
        pdf.setFontSize(12); pdf.text(`Libro de IVA · ${direction === "purchase" ? "Compras" : "Ventas"} · ${period}`, 12, 12);
        pdf.setFontSize(7);
        const headings = ["N.º", "Fecha", "RIF", "Contraparte", "Documento", "Tipo", "Afectada", "Exento", "Base", "IVA", "Retención"];
        const x = [12, 22, 42, 66, 116, 148, 174, 205, 225, 247, 265];
        const drawHeader = (y: number) => headings.forEach((heading, column) => pdf.text(heading, x[column]!, y));
        drawHeader(20);
        let y = 25;
        rows.forEach((row, index) => {
          if (y > 195) { pdf.addPage(); y = 14; drawHeader(y); y += 5; }
          const values = [String(index + 1), row.Fecha, row.RIF, row.Contraparte, row.Documento, row.Tipo, row["Factura afectada"], row.Exento, row.Base, row.IVA, row.Retención];
          values.forEach((value, column) => pdf.text(String(value).slice(0, column === 3 ? 28 : 18), x[column]!, y));
          y += 5;
        });
        pdf.save(`libro-iva-${direction}-${period}.pdf`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No fue posible exportar el período completo."); }
    finally { setExporting(false); }
  }

  return <div className="min-h-full bg-surface-2">
    <PageHeader title={title} subtitle="Libro fiscal basado en snapshots históricos de IVA">
      <BaseButton.Root variant="secondary" size="sm" isDisabled={loading} leftIcon={<RefreshCcw size={14} />} onPress={() => void load()}>
        Actualizar
      </BaseButton.Root>
    </PageHeader>
    <main className="px-4 py-6 md:px-8 space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <PeriodSelector label="Período" value={period} onChange={setPeriod} />
        <div className="flex rounded-lg border border-border-light bg-surface-1 p-1" role="tablist" aria-label="Tipo de consulta IVA">
          <BaseButton.Root role="tab" aria-selected={mode === "facts"} size="sm" variant={mode === "facts" ? "secondary" : "ghost"} leftIcon={<BookOpenCheck size={14} />} onPress={() => setMode("facts")}>Hechos guardados</BaseButton.Root>
          <BaseButton.Root role="tab" aria-selected={mode === "sources"} size="sm" variant={mode === "sources" ? "secondary" : "ghost"} leftIcon={<FileSearch size={14} />} onPress={() => setMode("sources")}>Fuentes por revisar</BaseButton.Root>
        </div>
        {mode === "facts" && <>
          <BaseInput.Field label="Buscar RIF, contraparte o documento" type="search" className="w-full sm:w-64" value={search} onValueChange={(value) => { setSearch(value); const query = new URLSearchParams(searchParams.toString()); if (value) query.set("q", value); else query.delete("q"); router.replace(`?${query}`); }} />
          <div className="w-full sm:w-44"><BaseSelect label="Quincena" selectionMode="single" items={FORTNIGHT_OPTIONS} value={fortnight} onValueChange={(value) => { const next = value || "all"; setFortnight(next); const query = new URLSearchParams(searchParams.toString()); if (next === "all") query.delete("quincena"); else query.set("quincena", next); router.replace(`?${query}`); }} /></div>
          <div className="flex flex-wrap gap-2"><BaseButton.Root variant="secondary" size="sm" isDisabled={exporting || !companyId} leftIcon={<Download size={14} />} onPress={() => void exportPeriod("csv")}>CSV</BaseButton.Root><BaseButton.Root variant="secondary" size="sm" isDisabled={exporting || !companyId} onPress={() => void exportPeriod("xlsx")}>Excel</BaseButton.Root><BaseButton.Root variant="secondary" size="sm" isDisabled={exporting || !companyId} onPress={() => void exportPeriod("pdf")}>PDF</BaseButton.Root></div>
        </>}
      </div>

      <p className="text-xs text-[var(--text-secondary)]">Rango: {range.from} — {range.to}. Los hechos guardados usan tasas históricas; las fuentes heredadas aún no se consideran hechos conciliados.</p>
      {!companyId && <div className="rounded-xl border border-border-light bg-surface-1 p-8 text-center text-sm">Selecciona una empresa para consultar su libro IVA.</div>}
      {loading && <p role="status" className="rounded-xl border border-border-light bg-surface-1 p-8 text-center text-sm">Consultando fuentes del libro…</p>}
      {error && <div role="alert" className="flex gap-3 rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
        <div><p className="font-semibold">No se pudo cargar esta consulta.</p><p className="mt-1 text-[var(--text-secondary)]">{error}</p>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Una fuente no disponible no equivale a un libro vacío ni a una declaración conciliada.</p></div>
      </div>}
      {exporting && <p role="status" className="text-xs text-[var(--text-secondary)]">Preparando la exportación del período…</p>}
      {!loading && !error && mode === "facts" && ledger && <>{summary && <PeriodTotals summary={summary} direction={direction} />}<FactLedger ledger={ledger} onNext={(cursor) => void load(JSON.stringify(cursor))} loading={loading} search={search} fortnight={fortnight} onSelect={setSelectedFact} /></>}
      {!loading && !error && mode === "sources" && sources && <LegacySources key={`${companyId}:${direction}:${period}`} sources={sources} direction={direction} companyId={companyId} from={range.from} to={range.to} period={period} onNext={(cursor) => void load(cursor)} loading={loading} />}
      {selectedFact && <DocumentDetail fact={selectedFact} onClose={() => setSelectedFact(null)} />}
    </main>
  </div>;
}

function PeriodTotals({ summary, direction }: { readonly summary: VatPeriodSummary; readonly direction: LedgerDirection }): React.JSX.Element {
  const sourceDirection = direction === "purchase" ? "purchase" : "sale";
  const count = summary.factCounts[sourceDirection] + (direction === "purchase" ? summary.factCounts.import : 0);
  const totals = summary.totals.filter((item) => item.direction === sourceDirection);
  const rates = summary.rateTotals.filter((item) => item.direction === sourceDirection);
  const relevant = direction === "purchase"
    ? [{ kind: "credit", label: "Crédito fiscal admitido" }, { kind: "credit_pending", label: "Crédito fiscal por revisar" }, { kind: "withholding_suffered", label: "Retención soportada" }]
    : [{ kind: "tax", label: "Débito fiscal" }, { kind: "withholding_practiced", label: "Retención practicada" }];
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><article className="rounded-xl border border-border-light bg-surface-1 p-4"><p className="text-xs text-[var(--text-tertiary)]">Documentos en el período</p><p className="mt-2 text-lg font-semibold">{count}</p></article>{relevant.map(({ kind, label }) => {
      const amounts = totals.filter((item) => item.kind === kind);
      return <article key={kind} className="rounded-xl border border-border-light bg-surface-1 p-4"><p className="text-xs text-[var(--text-tertiary)]">{label}</p>{amounts.length ? amounts.map((item, index) => <p key={`${item.amount.currency.code}-${index}`} className="mt-2 text-lg font-semibold tabular-nums">{formatIvaMoney(item.amount)}</p>) : <p className="mt-2 text-lg font-semibold">—</p>}</article>;
    })}</div>
    {rates.length > 0 && <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1"><h2 className="border-b border-border-light p-4 text-sm font-semibold">Totales completos del período por alícuota</h2><table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Componente</th><th className="p-3">Categoría</th><th className="p-3">Tasa</th><th className="p-3 text-right">Base</th><th className="p-3 text-right">Impuesto</th></tr></thead><tbody>{rates.map((item, index) => <tr key={`${item.component}:${item.category}:${item.rate}:${item.taxableBase.currency.code}:${index}`} className="border-t border-border-light/70"><td className="p-3">{ivaLabelOrPending(item.component ?? "base")}</td><td className="p-3">{ivaLabelOrPending(item.category)}</td><td className="p-3">{item.rate}%</td><td className="p-3 text-right">{formatIvaMoney(item.taxableBase)}</td><td className="p-3 text-right">{formatIvaMoney(item.taxAmount)}</td></tr>)}</tbody></table></div>}
  </section>;
}
function FactLedger({ ledger, onNext, loading, search, fortnight, onSelect }: { readonly ledger: LedgerPayload; readonly onNext: (cursor: NonNullable<LedgerPayload["nextCursor"]>) => void; readonly loading: boolean; readonly search: string; readonly fortnight: string; readonly onSelect: (fact: LedgerPayload["facts"][number]) => void }): React.JSX.Element {
  const facts = ledger.facts.filter((fact) => {
    const needle = search.trim().toLocaleLowerCase("es-VE");
    const matchesSearch = !needle || [fact.counterparty.name, fact.counterparty.taxIdentifier, fact.source.id, fact.documentKind, fact.affectedFactId].some((item) => item?.toLocaleLowerCase("es-VE").includes(needle));
    const day = Number(fact.documentDate?.slice(8, 10));
    const matchesFortnight = fortnight === "all" || (fortnight === "1" ? day <= 15 : day >= 16);
    return matchesSearch && matchesFortnight;
  });
  return <section className="space-y-4">
    <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1">
      {facts.length === 0 ? <p className="p-10 text-center text-sm">No hay hechos guardados con estos filtros en esta página.</p> : <table className="w-full min-w-[1050px] text-left text-sm">
        <thead><tr className="border-b border-border-light bg-surface-2/50 text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">N.º</th><th className="p-3">Fecha</th><th className="p-3">RIF / contraparte</th><th className="p-3">Factura / documento</th><th className="p-3">Tipo</th><th className="p-3">Afectada</th><th className="p-3">Conciliación</th><th className="p-3 text-right">Exento</th><th className="p-3 text-right">Base</th><th className="p-3 text-right">IVA</th><th className="p-3 text-right">Retención</th></tr></thead>
        <tbody>{facts.map((fact, index) => <FactRow key={fact.id} fact={fact} operation={index + 1} onSelect={onSelect} />)}</tbody>
      </table>}
      {ledger.nextCursor && <div className="border-t border-border-light p-4 text-center"><BaseButton.Root variant="secondary" size="sm" isDisabled={loading} onPress={() => onNext(ledger.nextCursor!)}>Cargar siguientes hechos</BaseButton.Root></div>}
    </div>
  </section>;
}

function FactRow({ fact, operation, onSelect }: { readonly fact: LedgerPayload["facts"][number]; readonly operation: number; readonly onSelect: (fact: LedgerPayload["facts"][number]) => void }): React.JSX.Element {
  const state = fact.reconciliation.state;
  return <tr tabIndex={0} onClick={() => onSelect(fact)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(fact); } }} className="cursor-pointer border-t border-border-light/70 hover:bg-surface-2"><td className="p-3">{operation}</td><td className="whitespace-nowrap p-3">{fact.documentDate}</td><td className="p-3">{fact.counterparty.taxIdentifier ?? "—"}<span className="block text-xs">{fact.counterparty.name ?? "—"}</span></td><td className="p-3">{fact.source.id}</td><td className="p-3">{ivaLabelOrPending(fact.documentKind)}</td><td className="p-3">{fact.affectedFactId ?? "—"}</td><td className={state === "issue" ? "p-3 text-warning" : "p-3 text-success"}>{ivaLabelOrPending(state)}</td><td className="whitespace-nowrap p-3 text-right">{formatMoney(fact.signed.exemptBase)}</td><td className="whitespace-nowrap p-3 text-right">{formatMoney(fact.signed.taxableBase)}</td><td className="whitespace-nowrap p-3 text-right">{formatMoney(fact.signed.taxAmount)}</td><td className="whitespace-nowrap p-3 text-right">{fact.withholding ? formatMoney(fact.withholding.amount) : "—"}</td></tr>;
}

function DocumentDetail({ fact, onClose }: { readonly fact: LedgerPayload["facts"][number]; readonly onClose: () => void }): React.JSX.Element {
  const fields: readonly (readonly [string, string])[] = [["Contraparte", fact.counterparty.name ?? "—"], ["RIF", fact.counterparty.taxIdentifier ?? "—"], ["Documento", fact.source.id], ["Factura afectada", fact.affectedFactId ?? "—"], ["Conciliación", ivaLabelOrPending(fact.reconciliation.state)], ["Deducibilidad", ivaLabelOrPending(fact.deductible.state)], ["Base", formatMoney(fact.signed.taxableBase)], ["Exento", formatMoney(fact.signed.exemptBase)], ["Impuesto", formatMoney(fact.signed.taxAmount)], ["Total", formatMoney(fact.signed.total)]];
  return <DocumentDrawer isOpen onClose={onClose} title="Detalle del documento" subtitle={`${fact.documentDate} · ${ivaLabelOrPending(fact.documentKind)}`} footer={<BaseButton.Root variant="secondary" size="sm" onPress={onClose}>Cerrar</BaseButton.Root>}>
    <div className="space-y-6 p-5">
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">{fields.map(([label, value]) => <div key={label} className="rounded-lg bg-surface-2 p-3"><dt className="text-xs text-[var(--text-secondary)]">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}</dl>
      <section><h3 className="font-semibold">Desglose por alícuota</h3><div className="mt-2 space-y-2">{fact.rateBreakdowns.map((rate, index) => <div key={index} className="rounded-lg border border-border-light p-3 text-sm">{ivaLabelOrPending(rate.category)} · {ivaLabelOrPending(rate.component ?? "base")} · {rate.rate}%<span className="mt-1 block">Base {formatMoney(rate.taxableBase)} · IVA {formatMoney(rate.taxAmount)}</span></div>)}</div></section>
      {fact.withholding && <section><h3 className="font-semibold">Retención</h3><p className="mt-2 text-sm">{ivaLabelOrPending(fact.withholding.kind)} · {formatMoney(fact.withholding.amount)} · {fact.withholding.certificateReference ?? "Sin comprobante"}</p></section>}
    </div>
  </DocumentDrawer>;
}

const FORTNIGHT_OPTIONS = [{ id: "all", name: "Todo el período" }, { id: "1", name: "Primera" }, { id: "2", name: "Segunda" }];

function csvCell(value: unknown): string { const text = String(value ?? ""); return `"${text.replaceAll('"', '""')}"`; }
function downloadFile(filename: string, blob: Blob): void { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); }
function responseError(value: unknown): string { if (typeof value === "object" && value !== null && "error" in value && typeof value.error === "string") return value.error; return "No fue posible consultar el período completo."; }

const REVIEW_RATE_CATEGORIES = ["taxable", "zero_rated", "exempt", "exonerated", "non_subject", "unknown"] as const;

interface ReviewRateInput {
  readonly rate: string;
  readonly category: typeof REVIEW_RATE_CATEGORIES[number] | "";
  readonly taxableBase: string;
  readonly taxAmount: string;
  readonly ruleVersion: string;
}

function LegacySources({ sources, direction, companyId, from, to, period, onNext, loading }: { readonly sources: LegacyVatSourcePage; readonly direction: LedgerDirection; readonly companyId: string | null; readonly from: string; readonly to: string; readonly period: string; readonly onNext: (cursor: string) => void; readonly loading: boolean }): React.JSX.Element {
  const [selected, setSelected] = useState<LegacyVatSourcePage["documents"][number] | null>(null);
  const [reviewedIds, setReviewedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [batchQueue, setBatchQueue] = useState<readonly LegacyVatSourcePage["documents"][number][]>([]);
  const [batchPrepared, setBatchPrepared] = useState<readonly Record<string, unknown>[]>([]);
  const [batchSaving, setBatchSaving] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const batchSubmission = useRef<{ readonly key: string; readonly body: string } | null>(null);
  const startBatch = () => {
    const queue = sources.documents.filter((source) => selectedIds.has(source.id) && !reviewedIds.has(source.id));
    if (queue.length === 0 || queue.length > 100) { setBatchError("Selecciona entre uno y 100 documentos visibles."); return; }
    setBatchError(null); setBatchPrepared([]); setBatchQueue(queue); setSelected(queue[0]!); setBatchMode(true); batchSubmission.current = null;
  };
  const prepareNext = (body: Record<string, unknown>) => {
    setBatchPrepared((current) => [...current, body]);
    setBatchQueue((current) => current.slice(1));
    setSelected(batchQueue[1] ?? null);
  };
  const commitBatch = async () => {
    if (!companyId || batchPrepared.length === 0) return;
    const body = JSON.stringify({ direction, companyId, items: batchPrepared });
    if (!batchSubmission.current || batchSubmission.current.body !== body) batchSubmission.current = { key: crypto.randomUUID(), body };
    setBatchSaving(true); setBatchError(null);
    try {
      const response = await fetch("/api/fiscal/iva/legacy-sources/batch", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": batchSubmission.current.key }, body: batchSubmission.current.body });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(responseError(payload));
      const results = (payload as { data: { items: readonly { readonly sourceId: string; readonly status: string; readonly reason?: string }[] } }).data.items;
      const incorporated = results.filter((item) => item.status === "incorporated");
      setReviewedIds((current) => new Set([...current, ...incorporated.map((item) => item.sourceId)]));
      setBatchPrepared([]); setBatchQueue([]); setBatchMode(false); setSelectedIds(new Set()); batchSubmission.current = null;
      const rejected = results.filter((item) => item.status === "rejected");
      setBatchError(rejected.length ? `${incorporated.length} incorporados; ${rejected.length} requieren corrección: ${rejected.map((item) => `${item.sourceId}: ${item.reason}`).join(" · ")}` : null);
    } catch (cause) { setBatchError(cause instanceof Error ? cause.message : "No fue posible completar el lote. Puedes reintentar sin cambiar su contenido."); }
    finally { setBatchSaving(false); }
  };
  return <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1">
    <div className="flex items-start gap-3 border-b border-border-light p-4 text-xs text-[var(--text-secondary)]"><AlertTriangle size={16} className="shrink-0 text-warning" /><p>Estos son snapshots crudos del sistema anterior. La vista no determina alícuotas, no los incorpora al libro fiscal y no los incluye en una declaración.</p></div>
    {companyId && sources.documents.length > 0 && <div className="flex flex-wrap items-center gap-3 border-b border-border-light p-4"><BaseButton.Root variant="primary" size="sm" isDisabled={selectedIds.size === 0 || selectedIds.size > 100 || batchMode} onPress={startBatch}>Revisar lote ({selectedIds.size})</BaseButton.Root>{selectedIds.size > 100 && <span className="text-xs text-warning">El límite es 100 documentos.</span>}</div>}
    {batchError && <p role="status" className="border-b border-border-light p-4 text-sm">{batchError}</p>}
    {batchMode && !selected && batchPrepared.length > 0 && <section className="space-y-3 border-b border-border-light bg-surface-2 p-4"><h3 className="font-semibold">Vista previa del lote · {batchPrepared.length} documentos</h3><p className="text-sm text-[var(--text-secondary)]">Se guardarán juntos solo los hechos revisados que no tengan pendientes bloqueantes. Si falla una inserción, la base revierte el lote completo.</p><ul className="max-h-40 space-y-1 overflow-y-auto text-xs">{batchPrepared.map((item, index) => <li key={`${String(item.sourceId)}:${index}`}>{String(item.sourceId)} · período {String(item.period)} · reconocimiento {String(item.recognitionDate)}</li>)}</ul><div className="flex flex-wrap gap-2"><BaseButton.Root variant="primary" size="sm" loading={batchSaving} onPress={() => void commitBatch()}>Confirmar incorporación revisada</BaseButton.Root><BaseButton.Root variant="secondary" size="sm" isDisabled={batchSaving} onPress={() => { setBatchPrepared([]); setBatchQueue([]); setBatchMode(false); batchSubmission.current = null; }}>Cancelar</BaseButton.Root></div></section>}
    {sources.documents.length === 0 ? <p className="p-10 text-center text-sm">No hay fuentes heredadas en este rango.</p> : <table className="w-full min-w-[900px] text-left text-sm">
      <thead><tr className="border-b border-border-light bg-surface-2/50 text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Selección</th><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Número</th><th className="p-3 text-right">IVA cabecera</th><th className="p-3">Pendientes detectados</th><th className="p-3">Actualizado</th><th className="p-3">Acción</th></tr></thead>
      <tbody>{sources.documents.map((source) => { const recorded = reviewedIds.has(source.id); return <tr key={source.id} className="border-t border-border-light/70"><td className="p-3"><BaseCheckbox.Field aria-label={`Seleccionar ${source.header.number ?? source.id}`} className="!w-auto" isSelected={selectedIds.has(source.id)} isDisabled={reviewedIds.has(source.id) || batchMode} onValueChange={(checked) => setSelectedIds((current) => { const next = new Set(current); if (checked) next.add(source.id); else next.delete(source.id); return next; })} /></td><td className="p-3">{source.documentDate ?? "—"}</td><td className="p-3">{ivaLabelOrPending(source.kind)}</td><td className="p-3">{source.header.number ?? source.id}</td><td className="p-3 text-right">{source.header.taxAmount ? String(source.header.taxAmount) : "—"}</td><td className="p-3">{source.pendingReasons?.length ? source.pendingReasons.map(ivaLabelOrPending).join(" · ") : "Sin pendientes detectados"}</td><td className="p-3">{source.updatedAt}</td><td className="p-3">{recorded ? <span className="whitespace-nowrap text-success">Hecho registrado</span> : <BaseButton.Root variant="ghost" size="sm" className="whitespace-nowrap" onPress={() => setSelected(source)}>Revisar evidencia</BaseButton.Root>}</td></tr>; })}</tbody>
    </table>}
    {sources.nextCursor && <div className="border-t border-border-light p-4 text-center"><BaseButton.Root variant="secondary" size="sm" isDisabled={loading} onPress={() => onNext(sources.nextCursor!)}>Cargar siguientes fuentes</BaseButton.Root></div>}
    {selected && companyId && <LegacyReviewForm key={`${selected.id}:${batchMode}`} source={selected} direction={direction} companyId={companyId} from={from} to={to} period={period} onSaved={() => setReviewedIds((current) => new Set(current).add(selected.id))} {...(batchMode ? { onPrepared: prepareNext } : {})} onClose={() => { if (batchMode) { setBatchQueue([]); setBatchMode(false); } setSelected(null); }} />}
  </div>;
}

function LegacyReviewForm({ source, direction, companyId, from, to, period, onSaved, onClose, onPrepared }: { readonly source: LegacyVatSourcePage["documents"][number]; readonly direction: LedgerDirection; readonly companyId: string; readonly from: string; readonly to: string; readonly period: string; readonly onSaved: () => void; readonly onClose: () => void; readonly onPrepared?: (body: Record<string, unknown>) => void }): React.JSX.Element {
  const [recognitionDate, setRecognitionDate] = useState(source.documentDate ?? "");
  const documentCurrency = isoCurrency(source.header.currency);
  const [currencyCode, setCurrencyCode] = useState(documentCurrency?.code ?? "");
  const minorUnit = isoCurrency(currencyCode)?.minorUnit ?? null;
  const isCorrection = source.kind.includes("credit_note") || source.kind.includes("debit_note");
  const affectedLabel = source.header.affectedNumber ?? source.affectedId;
  const [exemptBase, setExemptBase] = useState("");
  const [historicalExemptBase, setHistoricalExemptBase] = useState("");
  const [rates, setRates] = useState<ReviewRateInput[]>([{ rate: "", category: "", taxableBase: "", taxAmount: "", ruleVersion: "" }]);
  const [deductibleState, setDeductibleState] = useState<"eligible" | "ineligible" | "pending_review">("pending_review");
  const [deductibleAmount, setDeductibleAmount] = useState("0");
  const [deductibleReason, setDeductibleReason] = useState("");
  const [withholdingOccurredAt, setWithholdingOccurredAt] = useState("");
  const storageKey = `iva-review:${companyId}:${direction}:${source.id}`;
  const [pending, setPending] = useState<{ readonly key: string; readonly body: Record<string, unknown> } | null>(() => {
    try {
      const stored = typeof window === "undefined" ? null : window.sessionStorage.getItem(storageKey);
      if (!stored) return null;
      const value: unknown = JSON.parse(stored);
      return typeof value === "object" && value !== null && "key" in value && typeof value.key === "string" && "body" in value && typeof value.body === "object" && value.body !== null
        ? { key: value.key, body: value.body as Record<string, unknown> } : null;
    } catch { return null; }
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ readonly id: string; readonly state: string } | null>(null);

  const updateRate = (index: number, key: keyof ReviewRateInput, value: string) => setRates((current) => current.map((rate, i) => i === index ? { ...rate, [key]: value } : rate));
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const command = pending ?? {
        key: globalThis.crypto.randomUUID(),
        body: {
          companyId,
          sourceId: source.id,
          from,
          to,
          period,
          recognitionDate,
          recordedAt: new Date().toISOString(),
          currency: { code: currencyCode, minorUnit },
          exemptBase,
          historicalExemptBase: historicalExemptBase === "" ? null : historicalExemptBase,
          rates: rates.map((rate) => ({ ...rate, ruleVersion: rate.ruleVersion || null })),
          deductible: { state: deductibleState, amount: deductibleAmount, reason: deductibleReason || null },
          affectedSourceId: isCorrection ? source.affectedId : null,
          withholdingOccurredAt: withholdingOccurredAt ? new Date(withholdingOccurredAt).toISOString() : null,
        },
      };
      setPending(command);
      try { window.sessionStorage.setItem(storageKey, JSON.stringify(command)); } catch { /* Idempotency remains available while this dialog stays open. */ }
      if (onPrepared) {
        onPrepared(command.body);
        setSaved({ id: source.id, state: "prepared" });
        return;
      }
      const endpoint = `/api/fiscal/iva/legacy-${direction === "purchase" ? "purchase" : "sales"}-sources`;
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": command.key }, body: JSON.stringify(command.body) });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : "No fue posible registrar la revisión.";
        setError(message);
        if (response.status < 500) {
          setPending(null);
          try { window.sessionStorage.removeItem(storageKey); } catch { /* Storage can be unavailable in restricted browser contexts. */ }
        }
        return;
      }
      if (typeof payload !== "object" || payload === null || !("data" in payload) || typeof payload.data !== "object" || payload.data === null || !("fact" in payload.data)) throw new Error("La respuesta de revisión no es válida.");
      const fact = payload.data.fact;
      if (typeof fact !== "object" || fact === null || !("id" in fact) || typeof fact.id !== "string" || !("reconciliation" in fact) || typeof fact.reconciliation !== "object" || fact.reconciliation === null || !("state" in fact.reconciliation) || typeof fact.reconciliation.state !== "string") throw new Error("La respuesta no contiene el estado del hecho fiscal.");
      setSaved({ id: fact.id, state: fact.reconciliation.state });
      onSaved();
      setPending(null);
      try { window.sessionStorage.removeItem(storageKey); } catch { /* Storage can be unavailable in restricted browser contexts. */ }
    } catch (cause) {
      if (pending) {
        try { window.sessionStorage.setItem(storageKey, JSON.stringify(pending)); } catch { /* Keep the retry command in component state. */ }
      }
      setError(cause instanceof Error ? cause.message : "No fue posible registrar la revisión.");
    } finally {
      setSaving(false);
    }
  };

  const formId = `legacy-review-${source.id}`;
  const footer = saved
    ? <BaseButton.Root variant="secondary" size="sm" onPress={onClose}>Listo</BaseButton.Root>
    : <div className="flex flex-wrap justify-end gap-2"><BaseButton.Root variant="secondary" size="sm" isDisabled={saving} onPress={onClose}>Cancelar</BaseButton.Root><BaseButton.Root form={formId} type="submit" variant="primary" size="sm" loading={saving} isDisabled={Boolean(pending && !error) || minorUnit === null || (isCorrection && !source.affectedId)}>{pending ? "Reintentar guardado" : onPrepared ? "Agregar al lote" : "Guardar hecho revisado"}</BaseButton.Root></div>;

  return <DocumentDrawer isOpen onClose={onClose} isDismissable={!saving} title="Revisar fuente IVA" subtitle={`${ivaLabelOrPending(source.kind)} · ${source.header.number ?? source.id} · ${source.documentDate ?? "Sin fecha"}`} footer={footer}>
    {saved ? <div className="space-y-3 p-5"><p role="status" className="text-sm">Revisión guardada. Estado: <strong>{saved.state === "prepared" ? "preparado para el lote" : saved.state === "reconciled" ? "conciliado" : "requiere revisión"}</strong>.</p><p className="text-xs text-[var(--text-secondary)]">Un hecho con incidencias no se incluye en la preparación de declaraciones.</p></div> : <form id={formId} className="p-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={Boolean(pending)} className="space-y-5 disabled:opacity-60">
        <div className="rounded-lg border border-warning/30 p-3 text-xs text-[var(--text-secondary)]"><AlertTriangle size={14} className="mr-2 inline text-warning" />Las tasas y bases siguientes son evidencia que tú debes revisar; el sistema no las deduce del código heredado ni de reglas actuales.</div>
        <div className="rounded-lg border border-border-light p-3 text-xs"><p><strong>Contraparte:</strong> {source.header.counterpartyName ?? "Sin nombre"} · {source.header.counterpartyTaxId ?? "Sin identificación"}</p><p className="mt-1"><strong>Retención IVA guardada:</strong> {source.header.withheldAmount ?? "Sin dato"} · <strong>Comprobante:</strong> {source.header.withholdingCertificate ?? "Sin comprobante"}</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[360px] text-left"><thead><tr className="text-[10px] uppercase text-[var(--text-tertiary)]"><th className="p-1">Código heredado</th><th className="p-1 text-right">Base</th><th className="p-1 text-right">IVA guardado</th><th className="p-1 text-right">Neto línea</th></tr></thead><tbody>{source.lines.map((line, index) => <tr key={index} className="border-t border-border-light/70"><td className="p-1">{line.rateCode ?? "—"}</td><td className="p-1 text-right">{line.base ?? "—"}</td><td className="p-1 text-right">{line.taxAmount ?? "Sin dato"}</td><td className="p-1 text-right">{line.net ?? "—"}</td></tr>)}</tbody></table></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <BaseInput.Field label="Fecha de reconocimiento" type="date" isRequired value={recognitionDate} onValueChange={setRecognitionDate} />
          {documentCurrency
            ? <div className="text-sm"><p className="mb-1 text-xs text-[var(--text-tertiary)]">Moneda del documento</p><p className="font-medium">{documentCurrency.code} · {documentCurrency.minorUnit} decimales</p></div>
            : <BaseSelect label="Moneda del documento" placeholder="El documento no indica moneda" selectionMode="single" isRequired items={REVIEW_CURRENCY_OPTIONS} value={currencyCode} onValueChange={setCurrencyCode} />}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <BaseInput.Field label="Base exenta del documento" isRequired inputMode="decimal" inputClassName="text-right" placeholder="0.00" value={exemptBase} onValueChange={setExemptBase} />
          <BaseInput.Field label="Base exenta histórica verificada" inputMode="decimal" inputClassName="text-right" placeholder="Vacío si no se pudo verificar" value={historicalExemptBase} onValueChange={setHistoricalExemptBase} />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-bold uppercase tracking-wider">Desglose histórico de alícuotas</h3><BaseButton.Root variant="ghost" size="sm" onPress={() => setRates((current) => [...current, { rate: "", category: "", taxableBase: "", taxAmount: "", ruleVersion: "" }])}>Agregar tasa</BaseButton.Root></div>
          {rates.map((rate, index) => <div key={index} className="grid gap-3 rounded-lg border border-border-light p-3 sm:grid-cols-2 lg:grid-cols-5">
            <BaseInput.Field label="Tasa histórica" isRequired inputMode="decimal" suffix="%" inputClassName="text-right" placeholder="ej. 16" value={rate.rate} onValueChange={(value) => updateRate(index, "rate", value)} />
            <BaseSelect label="Categoría" placeholder="Seleccionar" selectionMode="single" isRequired items={REVIEW_CATEGORY_OPTIONS} value={rate.category} onValueChange={(value) => updateRate(index, "category", value)} />
            <BaseInput.Field label="Base gravada" isRequired inputMode="decimal" inputClassName="text-right" placeholder="0.00" value={rate.taxableBase} onValueChange={(value) => updateRate(index, "taxableBase", value)} />
            <BaseInput.Field label="IVA histórico" isRequired inputMode="decimal" inputClassName="text-right" placeholder="0.00" value={rate.taxAmount} onValueChange={(value) => updateRate(index, "taxAmount", value)} />
            <BaseInput.Field label="Versión/evidencia" placeholder="Opcional" value={rate.ruleVersion} onValueChange={(value) => updateRate(index, "ruleVersion", value)} />
            {rates.length > 1 && <BaseButton.Root variant="dangerOutline" size="sm" className="justify-self-start sm:col-span-2 lg:col-span-5" onPress={() => setRates((current) => current.filter((_, i) => i !== index))}>Quitar este grupo</BaseButton.Root>}
          </div>)}
        </div>
        {direction === "purchase" && <div className="grid gap-3 sm:grid-cols-3">
          <BaseSelect label="Crédito fiscal" selectionMode="single" items={REVIEW_DEDUCTIBLE_OPTIONS} value={deductibleState} onValueChange={(value) => value && setDeductibleState(value as typeof deductibleState)} />
          <BaseInput.Field label="Monto deducible" isRequired inputMode="decimal" inputClassName="text-right" value={deductibleAmount} onValueChange={setDeductibleAmount} />
          <BaseInput.Field label="Fundamento" placeholder="Referencia revisada" value={deductibleReason} onValueChange={setDeductibleReason} />
        </div>}
        {(isCorrection || (Number(source.header.withheldAmount ?? "0") !== 0 && direction === "purchase")) && <div className="grid gap-3 sm:grid-cols-2">
          {isCorrection && <div className="text-sm"><p className="mb-1 text-xs text-[var(--text-tertiary)]">Documento afectado</p>{affectedLabel ? <p className="font-medium">{affectedLabel}</p> : <p role="alert" className="text-warning">La nota no indica la factura afectada; corrígela en el documento de origen antes de incorporarla.</p>}<p className="mt-1 text-xs text-[var(--text-tertiary)]">El hecho original se vincula automáticamente; debe haberse incorporado antes.</p></div>}
          {Number(source.header.withheldAmount ?? "0") !== 0 && direction === "purchase" && <BaseInput.Field label="Fecha/hora revisada de retención" type="datetime-local" value={withholdingOccurredAt} onValueChange={setWithholdingOccurredAt} />}
        </div>}
        {error && <p role="alert" className="rounded-lg border border-danger/30 p-3 text-sm text-danger">{error}</p>}
        {pending && error && <p className="text-xs text-[var(--text-secondary)]">Al reintentar se reutiliza la misma clave y el mismo contenido para proteger contra duplicados.</p>}
      </fieldset>
    </form>}
  </DocumentDrawer>;
}

const REVIEW_CATEGORY_OPTIONS = REVIEW_RATE_CATEGORIES.map((category) => ({ id: category, name: ivaLabelOrPending(category) }));
const REVIEW_DEDUCTIBLE_OPTIONS = [{ id: "pending_review", name: "Pendiente de revisión" }, { id: "eligible", name: "Elegible" }, { id: "ineligible", name: "No elegible" }];

/** Resolves ISO 4217 decimals for a currency code; unknown codes stay unresolved instead of guessing. */
function isoCurrency(code: string | null | undefined): { readonly code: string; readonly minorUnit: number } | null {
  const normalized = code?.trim().toUpperCase() ?? "";
  if (!/^[A-Z]{3}$/.test(normalized)) return null;
  try { return { code: normalized, minorUnit: new Intl.NumberFormat("en", { style: "currency", currency: normalized }).resolvedOptions().maximumFractionDigits ?? 2 }; } catch { return null; }
}

const REVIEW_CURRENCY_OPTIONS = [{ id: "VES", name: "Bolívares (VES)" }, { id: "USD", name: "Dólares (USD)" }, { id: "EUR", name: "Euros (EUR)" }];

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function periodRange(period: string): { readonly from: string; readonly to: string } {
  const [year, month] = period.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, "0")}` };
}

function formatMoney(money: SerializedMoney): string {
  return formatIvaMoney(money);
}
