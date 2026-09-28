"use client";

import { FileText, RefreshCcw } from "lucide-react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { useFiscalDocuments } from "@/src/modules/sales/frontend/fiscal/use-fiscal-documents";
import { formatFiscalMoney } from "@/src/modules/sales/frontend/fiscal/format-fiscal-money";

/**
 * Opens the fiscal inbox for the current organization and company.
 * @returns A company-scoped, paginated document listing.
 * @throws Error if required application providers are unavailable.
 */
export default function FiscalInboxPage() {
  const { companyId } = useCompany();
  const { organization } = useOrganization();
  return <FiscalInbox key={JSON.stringify([organization?.id, companyId])} companyId={companyId} />;
}

function FiscalInbox({ companyId }: { companyId: string | null }) {
  const { items, loading, error, nextCursor, reload, loadMore } = useFiscalDocuments(companyId);
  return (
    <div className="min-h-full bg-surface-2 font-mono">
      <PageHeader title="Documentos fiscales" subtitle="Borradores, documentos emitidos y recibidos">
        <BaseButton.Root variant="secondary" size="sm" disabled={loading} leftIcon={<RefreshCcw size={14} />} onClick={reload}>Actualizar</BaseButton.Root>
      </PageHeader>
      <main className="px-4 py-6 md:px-8">
        {error && <div className="mb-4 space-y-2 rounded-lg border border-danger/30 p-4 text-sm">
          <p role="alert" className="text-danger">{error}</p>
          <button type="button" className="text-primary-500 underline" onClick={nextCursor ? loadMore : reload}>Reintentar</button>
        </div>}
        <div className="overflow-x-auto rounded-xl border border-border-light bg-surface-1">
          {!companyId ? <p className="p-10 text-center text-sm">Selecciona una empresa para consultar sus documentos fiscales.</p>
            : loading && !items.length ? <p role="status" className="p-10 text-center text-sm">Cargando documentos…</p>
            : !items.length && !error ? <div className="p-14 text-center">
              <FileText className="mx-auto text-[var(--text-tertiary)]" />
              <p className="mt-3 text-sm">No hay documentos fiscales todavía.</p>
              <p className="mt-2 text-xs text-[var(--text-secondary)]">Puedes preparar un borrador desde una venta de servicios confirmada que cumpla los requisitos fiscales.</p>
            </div>
            : items.length > 0 && <>
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-border-light bg-surface-2/50 text-xs uppercase text-[var(--text-tertiary)]">
                  <th scope="col" className="p-3">Fecha</th><th scope="col" className="p-3">Documento</th>
                  <th scope="col" className="p-3">Receptor</th><th scope="col" className="p-3">Estado</th>
                  <th scope="col" className="p-3 text-right">Total</th>
                </tr></thead>
                <tbody>{items.map(({ document, createdAt }) => <tr key={document.id} className="border-b border-border-light/50 hover:bg-surface-2">
                  <td className="whitespace-nowrap p-3">{new Date(createdAt).toLocaleDateString("es-VE")}</td>
                  <td className="p-3">
                    <Link className="text-primary-500 underline" title={document.id} href={"/sales/fiscal/" + encodeURIComponent(document.id)}>
                      {document.number ?? document.id}
                    </Link>
                  </td>
                  <td className="p-3">{document.recipient.legalName}</td>
                  <td className="p-3">{document.status === "draft" ? "Borrador" : document.status === "issued" ? "Emitido" : "Recibido"}</td>
                  <td className="whitespace-nowrap p-3 text-right">{formatFiscalMoney(document.totals.payableAmount)}</td>
                </tr>)}</tbody>
              </table>
              {nextCursor && <div className="p-4 text-center">
                <BaseButton.Root variant="secondary" size="sm" onClick={loadMore} disabled={loading}>{loading ? "Cargando…" : "Cargar siguientes documentos"}</BaseButton.Root>
              </div>}
            </>}
        </div>
      </main>
    </div>
  );
}
