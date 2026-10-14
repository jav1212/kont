"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BookOpenCheck, FileSearch, RefreshCcw } from "lucide-react";
import type { LegacyVatSourcePage, VatLedgerPage } from "@kontave/tax-reporting/application";
import type { TaxReportingFact } from "@kontave/tax-reporting/domain";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";

type LedgerDirection = "purchase" | "sale";
type LedgerMode = "facts" | "sources";
type SerializedMoney = { readonly currency: { readonly code: string; readonly minorUnit: number }; readonly minorAmount: string | number | bigint };
type LedgerPayload = Omit<VatLedgerPage, "facts" | "rateGroups" | "withholdingGroups"> & {
  readonly facts: readonly (Omit<TaxReportingFact, "signed" | "deductible" | "rateBreakdowns" | "withholding"> & {
    readonly signed: { readonly taxableBase: SerializedMoney; readonly taxAmount: SerializedMoney; readonly exemptBase: SerializedMoney; readonly total: SerializedMoney };
    readonly deductible: { readonly amount: SerializedMoney };
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
export function IvaLedgerView({ direction, title }: { readonly direction: LedgerDirection; readonly title: string }): React.JSX.Element {
  const { companyId } = useCompany();
  const [period, setPeriod] = useState(currentPeriod());
  const [mode, setMode] = useState<LedgerMode>("facts");
  const [ledger, setLedger] = useState<LedgerPayload | null>(null);
  const [sources, setSources] = useState<LegacyVatSourcePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => periodRange(period), [period]);
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
      const params = new URLSearchParams({ companyId, from: range.from, to: range.to, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`${endpoint}?${params}`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error : "No fue posible consultar el libro de IVA.";
        throw new Error(message);
      }
      if (typeof body !== "object" || body === null || !("data" in body)) throw new Error("La respuesta del libro de IVA no es válida.");
      if (mode === "facts") setLedger(body.data as LedgerPayload);
      else setSources(body.data as LegacyVatSourcePage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible consultar el libro de IVA.");
      setLedger(null);
      setSources(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, endpoint, mode, range.from, range.to]);

  useEffect(() => { void load(); }, [load]);

  return <div className="min-h-full bg-surface-2 font-mono">
    <PageHeader title={title} subtitle="Libro fiscal basado en snapshots históricos de IVA">
      <BaseButton.Root variant="secondary" size="sm" disabled={loading} leftIcon={<RefreshCcw size={14} />} onClick={() => void load()}>
        Actualizar
      </BaseButton.Root>
    </PageHeader>
    <main className="px-4 py-6 md:px-8 space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1 text-xs text-[var(--text-secondary)]">
          Período
          <input aria-label="Período" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-10 rounded-lg border border-border-light bg-surface-1 px-3 text-sm text-foreground" />
        </label>
        <div className="flex rounded-lg border border-border-light bg-surface-1 p-1" role="tablist" aria-label="Tipo de consulta IVA">
          <button type="button" role="tab" aria-selected={mode === "facts"} onClick={() => setMode("facts")} className={tabClass(mode === "facts")}>
            <BookOpenCheck size={14} /> Hechos guardados
          </button>
          <button type="button" role="tab" aria-selected={mode === "sources"} onClick={() => setMode("sources")} className={tabClass(mode === "sources")}>
            <FileSearch size={14} /> Fuentes por revisar
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--text-secondary)]">Rango: {range.from} — {range.to}. Los hechos guardados usan tasas históricas; las fuentes heredadas aún no se consideran hechos conciliados.</p>
      {!companyId && <div className="rounded-xl border border-border-light bg-surface-1 p-8 text-center text-sm">Selecciona una empresa para consultar su libro IVA.</div>}
      {loading && <p role="status" className="rounded-xl border border-border-light bg-surface-1 p-8 text-center text-sm">Consultando fuentes del libro…</p>}
      {error && <div role="alert" className="flex gap-3 rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
        <div><p className="font-semibold">No se pudo cargar esta consulta.</p><p className="mt-1 text-[var(--text-secondary)]">{error}</p>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">Una fuente no disponible no equivale a un libro vacío ni a una declaración conciliada.</p></div>
      </div>}
      {!loading && !error && mode === "facts" && ledger && <FactLedger ledger={ledger} onNext={(cursor) => void load(JSON.stringify(cursor))} loading={loading} />}
      {!loading && !error && mode === "sources" && sources && <LegacySources key={`${companyId}:${direction}:${period}`} sources={sources} direction={direction} companyId={companyId} from={range.from} to={range.to} onNext={(cursor) => void load(cursor)} loading={loading} />}
    </main>
  </div>;
}

function FactLedger({ ledger, onNext, loading }: { readonly ledger: LedgerPayload; readonly onNext: (cursor: NonNullable<LedgerPayload["nextCursor"]>) => void; readonly loading: boolean }): React.JSX.Element {
  return <section className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi label="Documentos en esta página" value={String(ledger.facts.length)} />
      <Kpi label="Grupos históricos de tasa" value={String(ledger.rateGroups.length)} />
      <Kpi label="Retenciones agrupadas" value={String(ledger.withholdingGroups.length)} />
      <Kpi label="Siguiente página" value={ledger.nextCursor ? "Disponible" : "No"} />
    </div>
    <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1">
      {ledger.facts.length === 0 ? <p className="p-10 text-center text-sm">No hay hechos guardados en este rango.</p> : <table className="w-full text-left text-sm">
        <thead><tr className="border-b border-border-light bg-surface-2/50 text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Fecha</th><th className="p-3">Origen</th><th className="p-3">Contraparte</th><th className="p-3">Conciliación</th><th className="p-3 text-right">Base</th><th className="p-3 text-right">IVA</th></tr></thead>
        <tbody>{ledger.facts.map((fact) => <FactRow key={fact.id} fact={fact} />)}</tbody>
      </table>}
      {ledger.nextCursor && <div className="border-t border-border-light p-4 text-center"><BaseButton.Root variant="secondary" size="sm" disabled={loading} onClick={() => onNext(ledger.nextCursor!)}>Cargar siguientes hechos</BaseButton.Root></div>}
    </div>
    {ledger.rateGroups.length > 0 && <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1">
      <h2 className="border-b border-border-light p-4 text-xs font-bold uppercase tracking-wider">Totales por tasa guardada en esta página</h2>
      <table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Componente</th><th className="p-3">Categoría</th><th className="p-3">Tasa</th><th className="p-3">Versión regla</th><th className="p-3 text-right">Base</th><th className="p-3 text-right">IVA</th></tr></thead>
        <tbody>{ledger.rateGroups.map((group, index) => <tr key={`${group.component}:${group.category}:${group.rate}:${group.ruleVersion}:${group.taxableBase.currency.code}:${index}`} className="border-t border-border-light/70"><td className="p-3">{group.component ?? "base"}</td><td className="p-3">{group.category}</td><td className="p-3">{group.rate}%</td><td className="p-3">{group.ruleVersion ?? "Sin versión registrada"}</td><td className="p-3 text-right">{formatMoney(group.taxableBase)}</td><td className="p-3 text-right">{formatMoney(group.taxAmount)}</td></tr>)}</tbody>
      </table>
    </div>}
    {ledger.withholdingGroups.length > 0 && <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1">
      <h2 className="border-b border-border-light p-4 text-xs font-bold uppercase tracking-wider">Retenciones históricas en esta página</h2>
      <table className="w-full text-left text-sm"><thead><tr className="text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Tipo</th><th className="p-3 text-right">Monto</th></tr></thead>
        <tbody>{ledger.withholdingGroups.map((group, index) => <tr key={`${group.kind}:${index}`} className="border-t border-border-light/70"><td className="p-3">{group.kind === "practiced" ? "Practicada" : "Sufrida"}</td><td className="p-3 text-right">{formatMoney(group.amount)}</td></tr>)}</tbody>
      </table>
    </div>}
  </section>;
}

function FactRow({ fact }: { readonly fact: LedgerPayload["facts"][number] }): React.JSX.Element {
  const state = fact.reconciliation.state;
  return <tr className="border-t border-border-light/70"><td className="whitespace-nowrap p-3">{fact.documentDate}</td><td className="p-3">{fact.source.kind}<span className="block text-[10px] text-[var(--text-tertiary)]">{fact.documentKind}</span></td><td className="p-3">{fact.counterparty.name ?? fact.counterparty.taxIdentifier ?? "—"}</td><td className={state === "issue" ? "p-3 text-warning" : "p-3 text-success"}>{state === "issue" ? "Revisión requerida" : "Conciliado"}</td><td className="whitespace-nowrap p-3 text-right">{formatMoney(fact.signed.taxableBase)}</td><td className="whitespace-nowrap p-3 text-right">{formatMoney(fact.signed.taxAmount)}</td></tr>;
}

const REVIEW_RATE_CATEGORIES = ["taxable", "zero_rated", "exempt", "exonerated", "non_subject", "unknown"] as const;

interface ReviewRateInput {
  readonly rate: string;
  readonly category: typeof REVIEW_RATE_CATEGORIES[number] | "";
  readonly taxableBase: string;
  readonly taxAmount: string;
  readonly ruleVersion: string;
}

function LegacySources({ sources, direction, companyId, from, to, onNext, loading }: { readonly sources: LegacyVatSourcePage; readonly direction: LedgerDirection; readonly companyId: string | null; readonly from: string; readonly to: string; readonly onNext: (cursor: string) => void; readonly loading: boolean }): React.JSX.Element {
  const [selected, setSelected] = useState<LegacyVatSourcePage["documents"][number] | null>(null);
  const [reviewedIds, setReviewedIds] = useState<ReadonlySet<string>>(() => new Set());
  return <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1">
    <div className="flex items-start gap-3 border-b border-border-light p-4 text-xs text-[var(--text-secondary)]"><AlertTriangle size={16} className="shrink-0 text-warning" /><p>Estos son snapshots crudos del sistema anterior. La vista no determina alícuotas, no los incorpora al libro fiscal y no los incluye en una declaración.</p></div>
    {sources.documents.length === 0 ? <p className="p-10 text-center text-sm">No hay fuentes heredadas en este rango.</p> : <table className="w-full text-left text-sm">
      <thead><tr className="border-b border-border-light bg-surface-2/50 text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Fecha</th><th className="p-3">Documento</th><th className="p-3">Número</th><th className="p-3 text-right">IVA cabecera</th><th className="p-3">Líneas</th><th className="p-3">Actualizado</th><th className="p-3">Acción</th></tr></thead>
      <tbody>{sources.documents.map((source) => { const recorded = reviewedIds.has(source.id); return <tr key={source.id} className="border-t border-border-light/70"><td className="p-3">{source.documentDate ?? "—"}</td><td className="p-3">{source.kind}</td><td className="p-3">{source.header.number ?? source.id}</td><td className="p-3 text-right">{source.header.taxAmount ? String(source.header.taxAmount) : "—"}</td><td className="p-3">{source.lines.length}</td><td className="p-3">{source.updatedAt}</td><td className="p-3"><button type="button" disabled={recorded} className="whitespace-nowrap text-primary-500 underline disabled:text-success disabled:no-underline" onClick={() => setSelected(source)}>{recorded ? "Hecho registrado" : "Revisar evidencia"}</button></td></tr>; })}</tbody>
    </table>}
    {sources.nextCursor && <div className="border-t border-border-light p-4 text-center"><BaseButton.Root variant="secondary" size="sm" disabled={loading} onClick={() => onNext(sources.nextCursor!)}>Cargar siguientes fuentes</BaseButton.Root></div>}
    {selected && companyId && <LegacyReviewForm key={selected.id} source={selected} direction={direction} companyId={companyId} from={from} to={to} onSaved={() => setReviewedIds((current) => new Set(current).add(selected.id))} onClose={() => setSelected(null)} />}
  </div>;
}

function LegacyReviewForm({ source, direction, companyId, from, to, onSaved, onClose }: { readonly source: LegacyVatSourcePage["documents"][number]; readonly direction: LedgerDirection; readonly companyId: string; readonly from: string; readonly to: string; readonly onSaved: () => void; readonly onClose: () => void }): React.JSX.Element {
  const [recognitionDate, setRecognitionDate] = useState(source.documentDate ?? "");
  const [currencyCode, setCurrencyCode] = useState(source.header.currency ?? "");
  const [minorUnit, setMinorUnit] = useState("");
  const [exemptBase, setExemptBase] = useState("");
  const [historicalExemptBase, setHistoricalExemptBase] = useState("");
  const [rates, setRates] = useState<ReviewRateInput[]>([{ rate: "", category: "", taxableBase: "", taxAmount: "", ruleVersion: "" }]);
  const [deductibleState, setDeductibleState] = useState<"eligible" | "ineligible" | "pending_review">("pending_review");
  const [deductibleAmount, setDeductibleAmount] = useState("0");
  const [deductibleReason, setDeductibleReason] = useState("");
  const [affectedFactId, setAffectedFactId] = useState("");
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
          recognitionDate,
          recordedAt: new Date().toISOString(),
          currency: { code: currencyCode, minorUnit: Number(minorUnit) },
          exemptBase,
          historicalExemptBase: historicalExemptBase === "" ? null : historicalExemptBase,
          rates: rates.map((rate) => ({ ...rate, ruleVersion: rate.ruleVersion || null })),
          deductible: { state: deductibleState, amount: deductibleAmount, reason: deductibleReason || null },
          affectedFactId: affectedFactId || null,
          withholdingOccurredAt: withholdingOccurredAt ? new Date(withholdingOccurredAt).toISOString() : null,
        },
      };
      setPending(command);
      try { window.sessionStorage.setItem(storageKey, JSON.stringify(command)); } catch { /* Idempotency remains available while this dialog stays open. */ }
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

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="legacy-review-title" className="mx-auto my-6 max-w-3xl rounded-xl border border-border-medium bg-surface-1 shadow-xl">
      <header className="flex items-start justify-between gap-4 border-b border-border-light p-5"><div><h2 id="legacy-review-title" className="text-sm font-bold uppercase tracking-wider">Revisar fuente IVA</h2><p className="mt-1 text-xs text-[var(--text-secondary)]">{source.kind} · {source.header.number ?? source.id} · {source.documentDate ?? "Sin fecha"}</p></div><button type="button" aria-label="Cerrar" className="text-[var(--text-secondary)] underline" onClick={onClose}>Cerrar</button></header>
      {saved ? <div className="space-y-3 p-5"><p role="status" className="text-sm">Revisión guardada como hecho {saved.id}. Estado: <strong>{saved.state === "reconciled" ? "conciliado" : "requiere revisión"}</strong>.</p><p className="text-xs text-[var(--text-secondary)]">Un hecho con incidencias no se incluye en la preparación de declaraciones.</p><BaseButton.Root variant="secondary" size="sm" onClick={onClose}>Listo</BaseButton.Root></div> : <form className="p-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={Boolean(pending)} className="space-y-5 disabled:opacity-60">
        <div className="rounded-lg border border-warning/30 p-3 text-xs text-[var(--text-secondary)]"><AlertTriangle size={14} className="mr-2 inline text-warning" />Las tasas y bases siguientes son evidencia que tú debes revisar; el sistema no las deduce del código heredado ni de reglas actuales.</div>
        <div className="rounded-lg border border-border-light p-3 text-xs"><p><strong>Contraparte:</strong> {source.header.counterpartyName ?? "Sin nombre"} · {source.header.counterpartyTaxId ?? "Sin identificación"}</p><p className="mt-1"><strong>Retención IVA guardada:</strong> {source.header.withheldAmount ?? "Sin dato"} · <strong>Comprobante:</strong> {source.header.withholdingCertificate ?? "Sin comprobante"}</p>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left"><thead><tr className="text-[10px] uppercase text-[var(--text-tertiary)]"><th className="p-1">Código heredado</th><th className="p-1 text-right">Base</th><th className="p-1 text-right">IVA guardado</th><th className="p-1 text-right">Neto línea</th></tr></thead><tbody>{source.lines.map((line, index) => <tr key={index} className="border-t border-border-light/70"><td className="p-1">{line.rateCode ?? "—"}</td><td className="p-1 text-right">{line.base ?? "—"}</td><td className="p-1 text-right">{line.taxAmount ?? "Sin dato"}</td><td className="p-1 text-right">{line.net ?? "—"}</td></tr>)}</tbody></table></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fecha de reconocimiento"><input required type="date" value={recognitionDate} onChange={(event) => setRecognitionDate(event.target.value)} className={fieldClass} /></Field>
          <Field label="Moneda"><input required maxLength={3} value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} className={fieldClass} /></Field>
          <Field label="Decimales de moneda"><input required type="number" min={0} max={6} value={minorUnit} onChange={(event) => setMinorUnit(event.target.value)} className={fieldClass} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Base exenta del documento"><input required inputMode="decimal" value={exemptBase} onChange={(event) => setExemptBase(event.target.value)} className={fieldClass} placeholder="0.00" /></Field>
          <Field label="Base exenta histórica verificada"><input inputMode="decimal" value={historicalExemptBase} onChange={(event) => setHistoricalExemptBase(event.target.value)} className={fieldClass} placeholder="Vacío si no se pudo verificar" /></Field>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-wider">Desglose histórico de alícuotas</h3><button type="button" className="text-xs text-primary-500 underline" onClick={() => setRates((current) => [...current, { rate: "", category: "", taxableBase: "", taxAmount: "", ruleVersion: "" }])}>Agregar tasa</button></div>
          {rates.map((rate, index) => <div key={index} className="grid gap-2 rounded-lg border border-border-light p-3 sm:grid-cols-5">
            <Field label="Tasa histórica"><input required inputMode="decimal" value={rate.rate} onChange={(event) => updateRate(index, "rate", event.target.value)} className={fieldClass} placeholder="ej. 16" /></Field>
            <Field label="Categoría"><select required value={rate.category} onChange={(event) => updateRate(index, "category", event.target.value)} className={fieldClass}><option value="">Seleccionar</option>{REVIEW_RATE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field>
            <Field label="Base gravada"><input required inputMode="decimal" value={rate.taxableBase} onChange={(event) => updateRate(index, "taxableBase", event.target.value)} className={fieldClass} placeholder="0.00" /></Field>
            <Field label="IVA histórico"><input required inputMode="decimal" value={rate.taxAmount} onChange={(event) => updateRate(index, "taxAmount", event.target.value)} className={fieldClass} placeholder="0.00" /></Field>
            <Field label="Versión/evidencia"><input value={rate.ruleVersion} onChange={(event) => updateRate(index, "ruleVersion", event.target.value)} className={fieldClass} placeholder="Opcional" /></Field>
            {rates.length > 1 && <button type="button" className="justify-self-start text-xs text-danger underline sm:col-span-5" onClick={() => setRates((current) => current.filter((_, i) => i !== index))}>Quitar este grupo</button>}
          </div>)}
        </div>
        {direction === "purchase" && <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Crédito fiscal"><select value={deductibleState} onChange={(event) => setDeductibleState(event.target.value as typeof deductibleState)} className={fieldClass}><option value="pending_review">Pendiente de revisión</option><option value="eligible">Elegible</option><option value="ineligible">No elegible</option></select></Field>
          <Field label="Monto deducible"><input required inputMode="decimal" value={deductibleAmount} onChange={(event) => setDeductibleAmount(event.target.value)} className={fieldClass} /></Field>
          <Field label="Fundamento"><input value={deductibleReason} onChange={(event) => setDeductibleReason(event.target.value)} className={fieldClass} placeholder="Referencia revisada" /></Field>
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          {source.kind.includes("credit_note") || source.kind.includes("debit_note") ? <Field label="Hecho IVA afectado"><input value={affectedFactId} onChange={(event) => setAffectedFactId(event.target.value)} className={fieldClass} placeholder="ID del hecho original" /></Field> : <div />}
          {Number(source.header.withheldAmount ?? "0") !== 0 && direction === "purchase" && <Field label="Fecha/hora revisada de retención"><input type="datetime-local" value={withholdingOccurredAt} onChange={(event) => setWithholdingOccurredAt(event.target.value)} className={fieldClass} /></Field>}
        </div>
        {error && <p role="alert" className="rounded-lg border border-danger/30 p-3 text-sm text-danger">{error}</p>}
        {pending && error && <p className="text-xs text-[var(--text-secondary)]">Al reintentar se reutiliza la misma clave y el mismo contenido para proteger contra duplicados.</p>}
        </fieldset>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border-light pt-4"><BaseButton.Root type="button" variant="secondary" size="sm" disabled={saving} onClick={onClose}>Cancelar</BaseButton.Root><BaseButton.Root type="submit" variant="primary" size="sm" disabled={saving || Boolean(pending && !error)}>{saving ? "Guardando…" : pending ? "Reintentar guardado" : "Guardar hecho revisado"}</BaseButton.Root></footer>
      </form>}
    </section>
  </div>;
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }): React.JSX.Element {
  return <label className="grid min-w-0 gap-1 text-[10px] text-[var(--text-secondary)]">{label}{children}</label>;
}

const fieldClass = "h-9 w-full min-w-0 rounded-md border border-border-light bg-surface-1 px-2 text-xs text-foreground";

function Kpi({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return <div className="rounded-xl border border-border-light bg-surface-1 p-4"><p className="text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p><p className="mt-2 text-lg font-bold tabular-nums">{value}</p></div>;
}

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
  let minorAmount: bigint;
  try { minorAmount = BigInt(money.minorAmount); } catch { return "—"; }
  const negative = minorAmount < 0n;
  const absolute = negative ? -minorAmount : minorAmount;
  const scale = 10n ** BigInt(money.currency.minorUnit);
  const whole = absolute / scale;
  const fraction = money.currency.minorUnit === 0 ? "" : `,${String(absolute % scale).padStart(money.currency.minorUnit, "0")}`;
  const groupedWhole = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(whole);
  return `${money.currency.code} ${negative ? "−" : ""}${groupedWhole}${fraction}`;
}

function tabClass(active: boolean): string {
  return ["inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors", active ? "bg-primary-500/10 text-primary-500" : "text-[var(--text-secondary)] hover:bg-surface-2"].join(" ");
}
