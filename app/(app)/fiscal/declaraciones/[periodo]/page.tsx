"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { DeclarationLifecycleActions } from "@/src/modules/iva/frontend/declaration-lifecycle-actions";
import { ApiRequestFailure } from "@/src/shared/frontend/feedback/api-request-failure";

interface Money { readonly minorAmount: string; readonly currency: { readonly code: string; readonly minorUnit: number } }
interface Declaration { readonly id: string; readonly period: string; readonly revision: number; readonly status: "draft" | "prepared" | "submitted" | "paid" | "void"; readonly createdAt: string; readonly payments: readonly { readonly reference: string; readonly amount: Money; readonly paidAt: string }[]; readonly summary: { readonly debitTax: Money; readonly deductibleCredit: Money; readonly withheldTax: Money; readonly carryForwardIn: Money; readonly adjustments: Money; readonly payable: Money } }

/** Shows the saved internal declaration revisions for one fiscal month.
 * @returns The selected period declaration history and internal totals.
 */
export default function VatDeclarationPeriodPage(): React.JSX.Element {
  const params = useParams<{ periodo: string }>();
  const period = decodeURIComponent(params.periodo);
  const { companyId } = useCompany();
  const [items, setItems] = useState<readonly Declaration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    const query = new URLSearchParams({ companyId, fromPeriod: period, toPeriod: period, limit: "50" });
    void fetch(`/api/fiscal/iva/declarations?${query}`, { cache: "no-store" }).then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok) throw new ApiRequestFailure(response, readError(body), body);
      setItems((body as { data: { items: readonly Declaration[] } }).data.items);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No fue posible cargar las declaraciones."));
  }, [companyId, period, reloadVersion]);

  async function downloadSummary(): Promise<void> {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    pdf.setFontSize(16); pdf.text(`Resumen interno de IVA · ${period}`, 16, 20);
    pdf.setFontSize(10); pdf.text("Borrador interno. No es la Forma IVA 30 oficial ni una constancia de presentación.", 16, 29, { maxWidth: 175 });
    let y = 45;
    for (const item of [...items].reverse()) {
      pdf.setFontSize(12); pdf.text(`Revisión ${item.revision} · ${statusLabel(item.status)} · ${item.createdAt.slice(0, 10)}`, 16, y); y += 8;
      pdf.setFontSize(10);
      for (const [label, amount] of [["Débito fiscal", item.summary.debitTax], ["Crédito fiscal admitido", item.summary.deductibleCredit], ["Retenciones", item.summary.withheldTax], ["Arrastre", item.summary.carryForwardIn], ["Ajustes", item.summary.adjustments], ["Resultado interno", item.summary.payable]] as const) { pdf.text(`${label}: ${money(amount)}`, 20, y); y += 6; }
      y += 4; if (y > 255) { pdf.addPage(); y = 20; }
    }
    pdf.save(`resumen-iva-${period}.pdf`);
  }

  return <div className="min-h-full bg-surface-2">
    <PageHeader title={`Resumen interno · ${period}`} subtitle="Revisiones guardadas de autoliquidación para este período" />
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-8">
      <p className="rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm">Registro interno de KONT. No es la Forma IVA 30 oficial ni una constancia de presentación.</p>
      <Link href={`/fiscal/declaraciones?periodo=${encodeURIComponent(period)}`} className="text-sm font-semibold text-primary-500 hover:underline">← Volver a declaraciones</Link>
      {error && <p role="alert" className="rounded-lg border border-warning/30 p-4 text-sm">{error}</p>}
      {!companyId && <p className="rounded-lg border border-border-light bg-surface-1 p-4 text-sm">Selecciona una empresa para consultar el período.</p>}
      {items.length > 0 && <div className="flex justify-end"><BaseButton.Root variant="secondary" onPress={() => void downloadSummary()}>Descargar PDF interno</BaseButton.Root></div>}
      {items.map((item) => <section key={`${item.id}:${item.revision}`} className="space-y-4 rounded-xl border border-border-light bg-surface-1 p-5">
        <h2 className="text-sm font-bold">Revisión {item.revision} · {statusLabel(item.status)} · {item.createdAt.slice(0, 10)}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
          { label: "Débito fiscal", value: item.summary.debitTax }, { label: "Crédito fiscal admitido", value: item.summary.deductibleCredit }, { label: "Retenciones", value: item.summary.withheldTax },
          { label: "Arrastre", value: item.summary.carryForwardIn }, { label: "Ajustes", value: item.summary.adjustments }, { label: "Resultado interno", value: item.summary.payable },
        ].map(({ label, value }) => <div key={label} className="rounded-lg bg-surface-2 p-3"><p className="text-xs text-[var(--text-secondary)]">{label}</p><p className="mt-1 font-semibold">{money(value)}</p></div>)}</div>
      </section>)}
      {items.length > 0 && <DeclarationLifecycleActions declaration={items.reduce((latest, item) => item.revision > latest.revision ? item : latest)} companyId={companyId} current onSaved={() => setReloadVersion((value) => value + 1)} />}
      {companyId && !error && items.length === 0 && <p className="rounded-lg border border-border-light bg-surface-1 p-5 text-sm">No hay revisiones guardadas para {period}.</p>}
    </main>
  </div>;
}

function money(value: Money): string {
  const minor = BigInt(value.minorAmount);
  const divisor = 10n ** BigInt(value.currency.minorUnit);
  const integer = (minor / divisor).toString();
  const fraction = value.currency.minorUnit ? `.${(minor % divisor).toString().padStart(value.currency.minorUnit, "0")}` : "";
  return `${integer}${fraction} ${value.currency.code}`;
}

function statusLabel(status: string): string { return ({ draft: "Borrador", prepared: "Preparada", submitted: "Presentada con evidencia", paid: "Pagada con evidencia", void: "Anulada internamente" })[status] ?? "Estado desconocido"; }
function readError(value: unknown): string { return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : "No fue posible cargar las declaraciones."; }
