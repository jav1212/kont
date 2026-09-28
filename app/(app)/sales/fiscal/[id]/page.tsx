"use client";

import { use, useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCcw } from "lucide-react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { useFiscalDocument } from "@/src/modules/sales/frontend/fiscal/use-fiscal-documents";
import { formatFiscalMoney } from "@/src/modules/sales/frontend/fiscal/format-fiscal-money";
import type { FiscalDocumentDto, FiscalEventDto } from "@/src/modules/sales/frontend/fiscal/fiscal-document-types";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";

const panel = "rounded-xl border border-border-light bg-surface-1 p-5";
const eventLabels: Record<string, string> = {
  "fiscal_document.prepared": "Borrador preparado",
  "fiscal_document.revised": "Borrador actualizado",
  "fiscal_document.issuance_accepted": "Emisión aceptada",
  "fiscal_document.issuance_rejected": "Emisión rechazada",
  "fiscal_document.issuance_unknown": "Emisión con resultado incierto",
};
const taxCategoryLabels: Record<string, string> = {
  taxable: "Gravado", exempt: "Exento", exonerated: "Exonerado",
  not_subject: "No sujeto", perceived: "Percibido", other: "Otro",
};

/**
 * Opens a fiscal document within the active organization and company.
 * @param props - Route parameters containing the fiscal document identifier.
 * @returns A detail view reset whenever the authorized workspace changes.
 * @throws Error if the required application providers are unavailable.
 */
export default function FiscalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { companyId } = useCompany();
  const { organization } = useOrganization();
  return <FiscalDetail key={JSON.stringify([organization?.id, companyId, id])} companyId={companyId} documentId={id} />;
}

function FiscalDetail({ companyId, documentId }: { companyId: string | null; documentId: string }) {
  const access = useOrganizationModuleAccess("/sales/fiscal/[id]");
  const detail = useFiscalDocument(companyId, documentId);
  const { document, metadata } = detail;
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<{ expectedRevision: number; reason: string; idempotencyKey: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mustReload, setMustReload] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const revisionRequest = useRef<AbortController | null>(null);

  useEffect(() => () => revisionRequest.current?.abort(), []);

  async function reload() {
    if (busy) return;
    await detail.reload();
    setPending(null);
    setMustReload(false);
  }

  async function revise() {
    if (!companyId || !metadata || busy || mustReload || !reason.trim()) return;
    const command = pending ?? {
      expectedRevision: metadata.revision,
      reason: reason.trim(),
      idempotencyKey: crypto.randomUUID(),
    };
    const controller = new AbortController();
    revisionRequest.current = controller;
    setPending(command);
    setBusy(true);
    setMessage(null);
    try {
      const response = await apiFetch("/api/fiscal/documents/" + encodeURIComponent(documentId) + "/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ companyId, ...command }),
      });
      const json = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 409) setMustReload(true);
        if ([400, 401, 403, 404, 422].includes(response.status)) setPending(null);
        throw new Error(json.error ?? "No se pudo actualizar el borrador.");
      }
      setPending(null);
      setReason("");
      setMessage(json.data?.replayed ? "La solicitud ya estaba aplicada. Se cargó la revisión vigente." : "Borrador actualizado desde la venta.");
      await detail.reload();
    } catch (cause) {
      if (!controller.signal.aborted) setMessage(cause instanceof Error ? cause.message : "No se pudo confirmar el resultado. Reintenta la misma solicitud.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (!companyId) return <p className="p-10 text-sm">Selecciona una empresa para consultar sus documentos fiscales.</p>;
  if (detail.loading) return <p role="status" className="p-10 text-sm">Cargando documento fiscal…</p>;
  if (detail.error || !document) {
    return <div className="space-y-3 p-10">
      <p role="alert" className="text-danger">{detail.error ?? "Documento no encontrado."}</p>
      <BaseButton.Root variant="secondary" onClick={reload}>Reintentar</BaseButton.Root>
    </div>;
  }

  const canRevise = metadata?.canRevise && access.can("sales.update") && metadata.source.kind === "legacy_sales_invoice";
  const parties = [["Emisor", document.issuer], ["Receptor", document.recipient]] as const;
  return (
    <div className="min-h-full bg-surface-2 font-mono">
      <PageHeader title={document.status === "draft" ? "Borrador fiscal" : "Documento fiscal"} subtitle={document.number ?? document.id}>
        <BaseButton.Root variant="secondary" size="sm" disabled={busy} leftIcon={<RefreshCcw size={14} />} onClick={reload}>Actualizar</BaseButton.Root>
      </PageHeader>
      <main className="space-y-5 px-4 py-6 md:px-8">
        <Link href="/sales/fiscal" className="text-sm text-primary-500">Volver a documentos fiscales</Link>
        <section className={panel}>
          <div className="grid gap-5 md:grid-cols-2">
            {parties.map(([label, party]) => {
              return <div key={label}>
                <h2 className="text-xs uppercase text-[var(--text-tertiary)]">{label}</h2>
                <p>{party.legalName}</p>
                <p className="text-sm">{party.taxIdentifier}</p>
                <p className="text-sm text-[var(--text-secondary)]">{party.fiscalAddress}</p>
              </div>;
            })}
          </div>
          <p className="mt-4 text-sm">Estado: {document.status === "draft" ? "Borrador" : document.status === "issued" ? "Emitido" : "Recibido"} · Revisión {metadata?.revision ?? "—"}</p>
          {document.issueDate && <p className="text-sm">Fecha de emisión: {document.issueDate}</p>}
          {metadata?.source.kind === "legacy_sales_invoice" && (
            <Link href={"/sales/" + encodeURIComponent(metadata.source.id)} className="mt-3 inline-block text-sm text-primary-500">
              <ExternalLink className="mr-1 inline" size={13} />Abrir venta origen
            </Link>
          )}
        </section>

        <section className={panel}>
          <h2 className="mb-3 font-sans font-semibold">Detalle e importes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border-light text-left">
                <th scope="col" className="p-3">Descripción</th><th scope="col">Cantidad</th>
                <th scope="col" className="text-right">Precio</th><th scope="col" className="p-3 text-right">Base</th>
              </tr></thead>
              <tbody>{document.lines.map((line) => (
                <tr key={line.id} className="border-b border-border-light/50">
                  <td className="p-3">{line.description}</td>
                  <td>{line.quantity} {line.unitCode}</td>
                  <td className="whitespace-nowrap text-right">{formatFiscalMoney(line.unitPrice)}</td>
                  <td className="whitespace-nowrap p-3 text-right">{formatFiscalMoney(line.netAmount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <dl className="ml-auto mt-4 grid max-w-md grid-cols-2 gap-2 text-sm">
            <dt>Importe bruto</dt><dd className="text-right">{formatFiscalMoney(document.totals.grossAmount)}</dd>
            <dt>Descuentos</dt><dd className="text-right">{formatFiscalMoney(document.totals.discountTotal)}</dd>
            <dt>Recargos</dt><dd className="text-right">{formatFiscalMoney(document.totals.surchargeTotal)}</dd>
            <dt>Base neta</dt><dd className="text-right">{formatFiscalMoney(document.totals.netAmount)}</dd>
            <dt>Impuestos</dt><dd className="text-right">{formatFiscalMoney(document.totals.taxTotal)}</dd>
            <dt className="font-bold">Total</dt><dd className="text-right font-bold">{formatFiscalMoney(document.totals.payableAmount)}</dd>
          </dl>
        </section>

        <section className={panel}>
          <h2 className="font-sans font-semibold">Evidencia tributaria</h2>
          <p className="mt-2 text-sm">Jurisdicción: {document.jurisdiction}</p>
          <ul className="mt-3 space-y-4 text-sm">{document.taxDeterminations?.map((tax, index) => (
            <li key={index} className="border-l-2 border-border-light pl-3">
              <p className="font-semibold">{tax.taxCode} · {tax.rate}% · {taxCategoryLabels[tax.category] ?? tax.category}</p>
              <p>Base: {formatFiscalMoney(tax.taxableBase)} · Importe: {formatFiscalMoney(tax.amount)}</p>
              <p>Regla: {tax.ruleVersion} · Fecha de operación: {tax.operationDate ?? "No registrada"}</p>
              <p>Fundamento: {tax.legalBasis ?? "No registrado"}</p>
              <p>Clasificación: {tax.classificationVersion ?? "No registrada"}</p>
              <p>Fundamento de clasificación: {tax.classificationLegalBasis ?? "No registrado"}</p>
            </li>
          ))}</ul>
          {!document.taxDeterminations?.length && <p className="mt-2 text-sm">Sin determinaciones registradas.</p>}
          {document.issuanceEvidence && (
            <p className="mt-4 break-words text-sm">Emisión: {document.issuanceEvidence.provider} · {document.issuanceEvidence.externalDocumentNumber}</p>
          )}
        </section>

        <section className={panel}>
          <h2 className="font-sans font-semibold">Historial</h2>
          {detail.eventsError && <div className="mt-3 text-sm">
            <p role="alert" className="text-danger">{detail.eventsError}</p>
            <button type="button" className="mt-2 text-primary-500 underline" onClick={detail.nextEventCursor ? detail.loadMoreEvents : detail.reloadEvents}>Reintentar historial</button>
          </div>}
          {!detail.events.length && !detail.eventsLoading && !detail.eventsError && <p className="mt-2 text-sm">Sin eventos registrados.</p>}
          <ol className="mt-3 space-y-4">{detail.events.map((event) => <AuditEvent key={event.id} event={event} />)}</ol>
          {detail.eventsLoading && <p role="status" className="mt-3 text-sm">Cargando historial…</p>}
          {detail.nextEventCursor && (
            <BaseButton.Root variant="secondary" size="sm" className="mt-4" disabled={detail.eventsLoading} onClick={detail.loadMoreEvents}>Cargar más historial</BaseButton.Root>
          )}
        </section>

        {message && <p role="status" className="rounded-lg border border-border-light p-3 text-sm">{message}</p>}
        {canRevise && (
          <section className={panel}>
            <h2 className="font-sans font-semibold">Actualizar borrador desde venta</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Recalcula los datos y montos desde la venta confirmada y conserva la revisión anterior en el historial. No emite el documento.</p>
            <label className="mt-4 block text-sm" htmlFor="revision-reason">Motivo</label>
            <textarea id="revision-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={busy || pending !== null} className="mt-1 block w-full rounded-lg border border-border-light bg-surface-2 p-2" required />
            {pending && !busy && !mustReload && <p className="mt-2 text-sm">El resultado no está confirmado. Reintenta con el mismo motivo y versión, o actualiza el documento para revisar su historial.</p>}
            {mustReload && <p role="alert" className="mt-2 text-sm">El documento cambió o la solicitud entró en conflicto. Actualiza el documento antes de iniciar otra revisión.</p>}
            <BaseButton.Root className="mt-3" variant="primary" size="sm" onClick={revise} disabled={busy || mustReload || !reason.trim()}>
              {busy ? "Actualizando…" : pending ? "Reintentar la misma solicitud" : "Actualizar borrador desde venta"}
            </BaseButton.Root>
          </section>
        )}
      </main>
    </div>
  );
}

function AuditEvent({ event }: { event: FiscalEventDto }) {
  const { payload } = event;
  return <li className="border-l-2 border-primary-500/30 pl-3 text-sm">
    <p className="font-semibold">{eventLabels[event.eventType] ?? "Evento fiscal"}</p>
    <time dateTime={event.recordedAt} className="text-[var(--text-tertiary)]">{new Date(event.recordedAt).toLocaleString("es-VE")}</time>
    {typeof payload.actorId === "string" && <p className="break-all">Responsable: {payload.actorId}</p>}
    {typeof payload.reason === "string" && <p>Motivo: {payload.reason}</p>}
    {typeof payload.fromRevision === "number" && typeof payload.toRevision === "number" && <p>Revisión {payload.fromRevision} → {payload.toRevision}</p>}
    {event.eventType === "fiscal_document.revised" && <details className="mt-2">
      <summary className="cursor-pointer text-primary-500">Comparar contenido conservado</summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <SnapshotSummary label="Antes" snapshot={payload.previousSnapshot} />
        <SnapshotSummary label="Después" snapshot={payload.replacementSnapshot} />
      </div>
    </details>}
  </li>;
}

function SnapshotSummary({ label, snapshot }: { label: string; snapshot: unknown }) {
  if (!snapshot || typeof snapshot !== "object" || !("totals" in snapshot) || !("lines" in snapshot)) return <p>{label}: contenido no disponible.</p>;
  const document = snapshot as FiscalDocumentDto;
  return <div className="space-y-2 rounded-lg border border-border-light p-3">
    <h3 className="font-semibold">{label}</h3>
    <p>Emisor: {document.issuer.legalName} · {document.issuer.taxIdentifier}</p>
    <p>{document.issuer.fiscalAddress}</p>
    <p>Receptor: {document.recipient.legalName} · {document.recipient.taxIdentifier}</p>
    <p>{document.recipient.fiscalAddress}</p>
    <ul className="space-y-1">{document.lines.map((line) => <li key={line.id}>{line.description} · {line.quantity} {line.unitCode} · {formatFiscalMoney(line.netAmount)}</li>)}</ul>
    <p>Base: {formatFiscalMoney(document.totals.netAmount)}</p>
    <p>Impuestos: {formatFiscalMoney(document.totals.taxTotal)}</p>
    <p className="font-semibold">Total: {formatFiscalMoney(document.totals.payableAmount)}</p>
    <ul>{document.taxDeterminations?.map((tax, index) => <li key={index}>{tax.taxCode} {tax.rate}% · {tax.ruleVersion} · {tax.operationDate} · {tax.legalBasis} · {tax.classificationVersion} · {tax.classificationLegalBasis}</li>)}</ul>
  </div>;
}
