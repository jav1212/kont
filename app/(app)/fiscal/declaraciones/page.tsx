"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileClock, RefreshCcw } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect } from "@/src/shared/frontend/components/base-select";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";

interface SerializedMoney { readonly minorAmount: string; readonly currency: { readonly code: string; readonly minorUnit: number }; }
interface DeclarationRecord {
  readonly id: string;
  readonly period: string;
  readonly revision: number;
  readonly status: "draft" | "prepared" | "submitted" | "paid" | "void";
  readonly summary: { readonly debitTax: SerializedMoney; readonly deductibleCredit: SerializedMoney; readonly withheldTax: SerializedMoney; readonly carryForwardIn: SerializedMoney; readonly adjustments: SerializedMoney; readonly payable: SerializedMoney };
  readonly submittedEvidence: { readonly reference: string; readonly submittedAt: string } | null;
  readonly voidEvidence?: { readonly reason: string; readonly voidedAt: string; readonly actorId: string } | null;
  readonly payments: readonly { readonly reference: string; readonly amount: SerializedMoney; readonly paidAt: string }[];
  readonly createdAt: string;
}
interface HistoryPage { readonly items: readonly DeclarationRecord[]; readonly nextCursor: { readonly period: string; readonly id: string; readonly revision: number } | null; }
type DeclarationCursor = NonNullable<HistoryPage["nextCursor"]>;

/** Provides an internal IVA draft and immutable declaration history for a selected company.
 * @returns A period-scoped declaration preparation and history screen.
 */
export default function IvaDeclarationsPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const [period, setPeriod] = useState(() => currentPeriod());
  const [historyYear, setHistoryYear] = useState(() => String(new Date().getFullYear()));
  const [historyStatus, setHistoryStatus] = useState("all");
  const [carryForward, setCarryForward] = useState("0.00");
  const [carryForwardReason, setCarryForwardReason] = useState("");
  const [adjustments, setAdjustments] = useState("0.00");
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [latest, setLatest] = useState<DeclarationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<{ fingerprint: string; key: string; body: string } | null>(null);

  const loadHistory = useCallback(async (cursor: DeclarationCursor | null = null, append = false) => {
    if (!companyId) { setHistory(null); return; }
    if (!append) setHistory(null);
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ companyId, fromPeriod: `${historyYear}-01`, toPeriod: `${historyYear}-12`, limit: "100" });
      if (cursor) query.set("cursor", JSON.stringify(cursor));
      const response = await fetch(`/api/fiscal/iva/declarations?${query}`, { cache: "no-store" });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const data = record(body).data as HistoryPage;
      setHistory((current) => append && current ? { ...data, items: [...current.items, ...data.items] } : data);
    } catch (cause) {
      setHistory(null);
      setError(cause instanceof Error ? cause.message : "No fue posible consultar el historial de declaraciones.");
    } finally { setLoading(false); }
  }, [companyId, historyYear]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const currentPeriodRevisions = (history?.items ?? []).filter((item) => item.period === period).sort((a, b) => a.revision - b.revision);
  const currentRevision = currentPeriodRevisions.at(-1) ?? null;
  const visibleHistory = (history?.items ?? []).filter((item) => historyStatus === "all" || item.status === historyStatus);

  async function prepare(): Promise<void> {
    if (!companyId) return;
    setSaving(true);
    setError(null);
    const fingerprint = JSON.stringify([companyId, period, carryForward, carryForwardReason, adjustments]);
    const previous = pending.current;
    const submission = previous?.fingerprint === fingerprint ? previous : {
      fingerprint,
      key: crypto.randomUUID(),
      body: JSON.stringify({
        companyId,
        period,
        carryForwardIn: carryForward,
        carryForwardReason,
        adjustments,
        declarationId: currentRevision?.id ?? crypto.randomUUID(),
        expectedRevision: currentRevision?.revision ?? null,
        createdAt: new Date().toISOString(),
      }),
    };
    pending.current = submission;
    try {
      const response = await fetch("/api/fiscal/iva/declarations/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submission.key },
        body: submission.body,
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const data = record(body).data as { readonly declaration: DeclarationRecord; readonly replayed: boolean };
      pending.current = null;
      setLatest(data.declaration);
      await loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible preparar el borrador interno.");
    } finally { setSaving(false); }
  }

  return <div className="min-h-full bg-surface-2">
    <PageHeader title="Declaraciones internas de IVA" subtitle="Preparación y consulta de borradores basados en hechos históricos" />
    <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-8">
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" /><p>Este resumen es un registro interno, no es la Forma IVA 30 oficial ni una constancia de presentación. El arrastre y los ajustes deben ser revisados e ingresados por el responsable contable.</p></div>
      {!companyId && <div className="rounded-xl border border-border-light bg-surface-1 p-5 text-sm">Selecciona una empresa para consultar su historial.</div>}
      <section className="space-y-4 rounded-xl border border-border-light bg-surface-1 p-5 md:p-7">
        <h2 className="text-sm font-bold">Preparar borrador del período</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <BaseInput.Field label="Período" type="month" value={period} onValueChange={setPeriod} />
          <BaseInput.Field label="Arrastre manual (solo sin declaración previa)" inputMode="decimal" prefix="Bs." inputClassName="text-right" value={carryForward} onValueChange={setCarryForward} pattern="\d+(\.\d{1,2})?" />
          <BaseInput.Field label="Motivo del arrastre manual" maxLength={500} placeholder="Obligatorio si no hay período anterior en KONT" value={carryForwardReason} onValueChange={setCarryForwardReason} />
          <BaseInput.Field label="Ajustes revisados (débito positivo)" inputMode="decimal" prefix="Bs." inputClassName="text-right" value={adjustments} onValueChange={setAdjustments} pattern="-?\d+(\.\d{1,2})?" />
        </div>
        <p className="text-xs text-[var(--text-secondary)]">El servidor toma el arrastre del último período declarado o pagado. Solo permite un monto manual cuando no existe declaración anterior y exige un motivo. Si hay una declaración anterior sin evidencia externa, debe completarse antes.</p>
        <BaseButton.Root variant="primary" loading={saving} isDisabled={!companyId || loading || Boolean(history?.nextCursor)} onPress={() => void prepare()}>{loading ? "Cargando historial…" : history?.nextCursor ? "Carga el historial completo para continuar" : currentRevision ? "Crear siguiente revisión interna" : "Preparar borrador interno"}</BaseButton.Root>
      </section>
      {latest && <DeclarationSummary declaration={latest} title="Borrador preparado" />}
      {error && <div role="alert" className="rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm">{error}</div>}
      <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1">
        <div className="flex flex-col gap-3 border-b border-border-light p-4 md:flex-row md:items-end md:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold"><FileClock size={16} /> Historial de declaraciones</h2>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 md:w-[26rem]"><BaseSelect label="Año" size="sm" selectionMode="single" items={YEAR_OPTIONS} value={historyYear} onValueChange={(value) => value && setHistoryYear(value)} /><BaseSelect label="Estado" size="sm" selectionMode="single" items={STATUS_OPTIONS} value={historyStatus} onValueChange={(value) => setHistoryStatus(value || "all")} /><BaseButton.Root variant="ghost" size="sm" isIconOnly aria-label="Actualizar historial" isDisabled={loading || !companyId} onPress={() => void loadHistory()}><RefreshCcw size={15} /></BaseButton.Root></div>
        </div>
        {loading ? <p role="status" className="p-8 text-center text-sm">Consultando historial…</p>
          : visibleHistory.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-border-light text-xs uppercase text-[var(--text-tertiary)]"><th className="p-3">Período</th><th className="p-3">Estado</th><th className="p-3">Revisión</th><th className="p-3">Fecha</th><th className="p-3 text-right">Débito</th><th className="p-3 text-right">Crédito</th><th className="p-3 text-right">Retenciones</th><th className="p-3 text-right">Resultado interno</th><th className="p-3">Detalle</th></tr></thead><tbody>{visibleHistory.map((item) => <tr key={`${item.id}:${item.revision}`} className="border-t border-border-light/70"><td className="p-3"><Link className="font-semibold text-primary-500 hover:underline" href={`/fiscal/declaraciones/${encodeURIComponent(item.period)}`}>{item.period}</Link></td><td className="p-3">{statusLabel(item.status)}</td><td className="p-3">{item.revision}</td><td className="p-3">{item.createdAt.slice(0, 10)}</td><td className="p-3 text-right">{moneyLabel(item.summary.debitTax)}</td><td className="p-3 text-right">{moneyLabel(item.summary.deductibleCredit)}</td><td className="p-3 text-right">{moneyLabel(item.summary.withheldTax)}</td><td className="p-3 text-right">{moneyLabel(item.summary.payable)}</td><td className="p-3"><Link className="text-primary-500 hover:underline" href={`/fiscal/declaraciones/${encodeURIComponent(item.period)}`}>Abrir</Link></td></tr>)}</tbody></table></div>
          : !error && <p className="p-8 text-center text-sm text-[var(--text-secondary)]">No hay revisiones guardadas para este período.</p>}
        {history?.nextCursor && <div className="border-t border-border-light p-3 text-center"><BaseButton.Root variant="ghost" size="sm" isDisabled={loading} onPress={() => void loadHistory(history.nextCursor, true)}>Cargar más revisiones del año</BaseButton.Root></div>}
      </section>
    </main>
  </div>;
}

function DeclarationSummary({ declaration, title }: { readonly declaration: DeclarationRecord; readonly title: string }): React.JSX.Element {
  return <section className="space-y-3 rounded-xl border border-border-light bg-surface-1 p-5"><h2 className="text-sm font-bold">{title} · {declaration.period}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="Débito fiscal" value={moneyLabel(declaration.summary.debitTax)} /><Kpi label="Crédito elegible" value={moneyLabel(declaration.summary.deductibleCredit)} /><Kpi label="Retenciones" value={moneyLabel(declaration.summary.withheldTax)} /><Kpi label="Resultado interno" value={moneyLabel(declaration.summary.payable)} /></div></section>;
}

function Kpi({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element { return <div className="rounded-lg bg-surface-2 p-3"><p className="text-[10px] uppercase text-[var(--text-tertiary)]">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>; }
const STATUS_OPTIONS = [{ id: "all", name: "Todos" }, { id: "draft", name: "Borrador" }, { id: "prepared", name: "Preparada" }, { id: "submitted", name: "Presentada" }, { id: "paid", name: "Pagada" }, { id: "void", name: "Anulada" }];
// Declarations start with KONT's IVA module; a list avoids free-typed years outside the stored history.
const YEAR_OPTIONS = Array.from({ length: new Date().getFullYear() - 2019 }, (_, index) => String(new Date().getFullYear() - index)).map((year) => ({ id: year, name: year }));
function currentPeriod(): string { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; }
function record(value: unknown): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("La respuesta del servidor no es válida."); return value as Record<string, unknown>; }
function errorMessage(value: unknown): string { const body = record(value); return typeof body.error === "string" ? body.error : "No fue posible completar la operación."; }
function statusLabel(status: DeclarationRecord["status"]): string { return ({ draft: "Borrador", prepared: "Preparada", submitted: "Presentada (evidencia)", paid: "Pagada (evidencia)", void: "Anulada internamente" })[status]; }
function moneyLabel(value: SerializedMoney): string {
  const minor = BigInt(value.minorAmount);
  const unit = 10n ** BigInt(value.currency.minorUnit);
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const fraction = value.currency.minorUnit === 0 ? "" : `.${(absolute % unit).toString().padStart(value.currency.minorUnit, "0")}`;
  return `${negative ? "-" : ""}${(absolute / unit).toString()}${fraction} ${value.currency.code}`;
}
