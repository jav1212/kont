"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";

type ImportKind = "goods" | "foreign_service";
type ImportCategory = "taxable" | "zero_rated" | "exempt" | "exonerated" | "non_subject" | "unknown";

/** Captures a manually reviewed import assessment and sends it to the shared tax-reporting API.
 * @returns The company-scoped import review form.
 */
export default function IvaImportsPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const [kind, setKind] = useState<ImportKind>("goods");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pendingSubmission = useRef<{ readonly fingerprint: string; readonly key: string; readonly body: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setSaved(false);
    if (!companyId) { setError("Selecciona una empresa antes de registrar la importación."); return; }
    const form = new FormData(formElement);
    try {
      const documentDate = text(form, "documentDate");
      const recognitionDate = text(form, "recognitionDate");
      const currency = { code: "VES", minorUnit: 2 };
      const taxableMinor = toMinor(text(form, "taxableBase"));
      const exemptMinor = toMinor(text(form, "exemptBase"));
      const taxMinor = toMinor(text(form, "taxAmount"));
      const deductibleState = text(form, "deductibleState") as "eligible" | "ineligible" | "pending_review";
      const deductibleMinor = deductibleState === "eligible" ? toMinor(text(form, "deductibleAmount")) : 0n;
      const taxableCategory = text(form, "taxableCategory") as ImportCategory;
      const exemptCategory = text(form, "exemptCategory") as ImportCategory;
      const money = (minorAmount: bigint) => ({ minorAmount: minorAmount.toString(), currency });
      const taxBreakdowns = [
        ...(taxableMinor !== 0n || taxMinor !== 0n ? [{ rate: text(form, "taxableRate"), category: taxableCategory, taxableBase: money(taxableMinor), taxAmount: money(taxMinor), ruleVersion: null, component: "base" }] : []),
        ...(exemptMinor !== 0n ? [{ rate: "0", category: exemptCategory, taxableBase: money(exemptMinor), taxAmount: money(0n), ruleVersion: null, component: "base" }] : []),
      ];
      if (taxBreakdowns.length === 0) throw new Error("Ingresa al menos una base imponible o exenta.");
      const documentReference = kind === "goods" ? text(form, "declarationNumber") : text(form, "invoiceReference");
      const reliefInstrument = text(form, "reliefInstrument");
      const reliefCertificate = text(form, "reliefCertificate");
      const reliefIssuedAt = text(form, "reliefIssuedAt");
      const hasReliefEvidence = Boolean(reliefInstrument || reliefCertificate || reliefIssuedAt);
      if (hasReliefEvidence && !(reliefInstrument && reliefCertificate && reliefIssuedAt)) throw new Error("Completa instrumento legal, certificado y fecha de emisión para registrar evidencia de beneficio.");
      const relief = hasReliefEvidence ? { legalInstrument: reliefInstrument, certificateReference: reliefCertificate, issuedAt: reliefIssuedAt } : null;
      if ((taxableCategory === "exonerated" || exemptCategory === "exonerated") && !relief) throw new Error("Una importación exonerada requiere instrumento legal, certificado y fecha de emisión.");
      const fact = {
        id: crypto.randomUUID(),
        scope: { tenantId: "server-derived", organizationId: "server-derived", companyId },
        source: { kind: "custom", id: documentReference, lineageKey: `import:${kind}:${documentReference}` },
        direction: "import",
        documentKind: kind === "goods" ? "import_declaration" : "foreign_service_assessment",
        documentDate,
        recognitionDate,
        period: recognitionDate.slice(0, 7),
        counterparty: { taxIdentifier: null, name: text(form, "counterparty"), countryCode: kind === "foreign_service" ? text(form, "providerCountryCode") : "VE" },
        currency,
        signed: {
          taxableBase: money(taxableMinor),
          taxAmount: money(taxMinor),
          exemptBase: money(exemptMinor),
          total: money(taxableMinor + exemptMinor + taxMinor),
        },
        rateBreakdowns: taxBreakdowns,
        affectedFactId: null,
        deductible: {
          state: deductibleState,
          amount: money(deductibleMinor),
          reason: deductibleState === "eligible" ? text(form, "deductibleReason") : deductibleState === "ineligible" ? text(form, "deductibleReason") : "Pendiente de revisión profesional.",
        },
        withholding: null,
        importEvidence: kind === "goods" ? {
          kind,
          declarationNumber: text(form, "declarationNumber"),
          declaredAt: text(form, "declaredAt"),
          paidAt: new Date(text(form, "paidAt")).toISOString(),
          paymentReference: text(form, "paymentReference"),
          authority: text(form, "authority"),
          tariffCode: text(form, "tariffCode"),
          reference: text(form, "customsReference") || null,
          relief,
        } : {
          kind,
          invoiceReference: text(form, "invoiceReference"),
          serviceDate: text(form, "serviceDate"),
          paidAt: new Date(text(form, "paidAt")).toISOString(),
          paymentReference: text(form, "paymentReference"),
          providerCountryCode: text(form, "providerCountryCode").toUpperCase(),
          relief,
        },
        reconciliation: form.get("reconciled") === "on"
          ? { state: "reconciled", reason: null, expectedTaxAmount: null }
          : { state: "issue", reason: text(form, "reviewReason") || "Importes pendientes de conciliación documental.", expectedTaxAmount: null },
        recordedAt: new Date().toISOString(),
      };
      const fingerprint = JSON.stringify(Array.from(form.entries()));
      const previous = pendingSubmission.current;
      const submission = previous?.fingerprint === fingerprint
        ? previous
        : { fingerprint, key: crypto.randomUUID(), body: JSON.stringify({ companyId, fact }) };
      pendingSubmission.current = submission;
      setSaving(true);
      const response = await fetch("/api/fiscal/iva/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submission.key },
        body: submission.body,
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      pendingSubmission.current = null;
      setSaved(true);
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible registrar la evidencia de importación.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="min-h-full bg-surface-2 font-mono">
    <PageHeader title="Importaciones e IVA" subtitle="Captura de evidencia aduanera o de servicios del exterior" />
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 md:px-8">
      <div className="flex gap-3 rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm">
        <AlertTriangle className="mt-0.5 shrink-0 text-warning" size={18} />
        <p>Registra importes transcritos de documentos revisados. Esta pantalla no determina tasas, elegibilidad del crédito ni derecho a una exoneración. Seleccionar “conciliado” confirma que cotejaste los documentos y montos.</p>
      </div>
      {!companyId && <p className="rounded-xl border border-border-light bg-surface-1 p-5 text-sm">Selecciona una empresa para capturar un hecho de importación.</p>}
      {saved && <p role="status" className="flex items-center gap-2 rounded-xl border border-success/30 bg-surface-1 p-4 text-sm"><CheckCircle2 size={17} /> Evidencia registrada para la empresa.</p>}
      {error && <p role="alert" className="rounded-xl border border-warning/30 bg-surface-1 p-4 text-sm">No se guardó: {error}</p>}
      <form onSubmit={(event) => void submit(event)} className="space-y-6 rounded-xl border border-border-light bg-surface-1 p-5 md:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de importación"><select value={kind} onChange={(event) => setKind(event.target.value as ImportKind)} className={inputClass}><option value="goods">Bienes (declaración aduanera)</option><option value="foreign_service">Servicio de proveedor extranjero</option></select></Field>
          <Field label="Contraparte / proveedor"><input name="counterparty" required maxLength={200} className={inputClass} /></Field>
          <Field label="Fecha del documento"><input name="documentDate" type="date" required className={inputClass} /></Field>
          <Field label="Fecha de reconocimiento IVA"><input name="recognitionDate" type="date" required className={inputClass} /></Field>
          {kind === "goods" ? <>
            <Field label="Número de declaración"><input name="declarationNumber" required maxLength={128} className={inputClass} /></Field>
            <Field label="Fecha de declaración"><input name="declaredAt" type="date" required className={inputClass} /></Field>
            <Field label="Autoridad aduanera"><input name="authority" required maxLength={128} className={inputClass} /></Field>
            <Field label="Código arancelario"><input name="tariffCode" required maxLength={32} className={inputClass} /></Field>
            <Field label="Referencia de pago de tributos"><input name="paymentReference" required maxLength={128} className={inputClass} /></Field>
            <Field label="Referencia aduanera adicional"><input name="customsReference" maxLength={128} className={inputClass} /></Field>
          </> : <>
            <Field label="Referencia de factura extranjera"><input name="invoiceReference" required maxLength={128} className={inputClass} /></Field>
            <Field label="Fecha del servicio"><input name="serviceDate" type="date" required className={inputClass} /></Field>
            <Field label="País del proveedor (ISO 3166-1 alfa-2)"><input name="providerCountryCode" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" className={inputClass} /></Field>
            <Field label="Referencia del pago de IVA"><input name="paymentReference" required maxLength={128} className={inputClass} /></Field>
          </>}
          <Field label="Fecha y hora del pago"><input name="paidAt" type="datetime-local" required className={inputClass} /></Field>
        </div>

        <section className="space-y-3 border-t border-border-light pt-5">
          <h2 className="text-sm font-bold">Importes revisados (VES)</h2>
          <p className="text-xs text-[var(--text-secondary)]">Copia el desglose ya determinado en los soportes. No se calcula IVA en esta pantalla.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Base sujeta / de la categoría"><input name="taxableBase" inputMode="decimal" defaultValue="0" required pattern="\d+(\.\d{1,2})?" className={inputClass} /></Field>
            <Field label="Categoría de esa base"><select name="taxableCategory" className={inputClass}><option value="taxable">Gravada</option><option value="zero_rated">Tasa cero</option><option value="exempt">Exenta</option><option value="exonerated">Exonerada</option><option value="non_subject">No sujeta</option><option value="unknown">Pendiente de clasificar</option></select></Field>
            <Field label="Tasa histórica documentada (%)"><input name="taxableRate" inputMode="decimal" defaultValue="0" required pattern="\d+(\.\d+)?" className={inputClass} /></Field>
            <Field label="IVA liquidado según soporte"><input name="taxAmount" inputMode="decimal" defaultValue="0" required pattern="\d+(\.\d{1,2})?" className={inputClass} /></Field>
            <Field label="Otra base: exenta / no sujeta / exonerada"><input name="exemptBase" inputMode="decimal" defaultValue="0" required pattern="\d+(\.\d{1,2})?" className={inputClass} /></Field>
            <Field label="Categoría de la otra base"><select name="exemptCategory" className={inputClass}><option value="exempt">Exenta</option><option value="exonerated">Exonerada</option><option value="zero_rated">Tasa cero</option><option value="non_subject">No sujeta</option><option value="unknown">Pendiente de clasificar</option></select></Field>
          </div>
        </section>

        <section className="space-y-3 border-t border-border-light pt-5">
          <h2 className="text-sm font-bold">Crédito fiscal soportado</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Estado de revisión"><select name="deductibleState" className={inputClass}><option value="pending_review">Pendiente de revisión (por defecto)</option><option value="eligible">Elegible según revisión profesional</option><option value="ineligible">No elegible</option></select></Field>
            <Field label="Monto deducible si fue aprobado"><input name="deductibleAmount" inputMode="decimal" defaultValue="0" pattern="\d+(\.\d{1,2})?" className={inputClass} /></Field>
            <Field label="Fundamento / nota de revisión"><input name="deductibleReason" maxLength={500} className={inputClass} /></Field>
          </div>
        </section>

        <section className="space-y-3 border-t border-border-light pt-5">
          <h2 className="text-sm font-bold">Beneficio de importación, si aplica</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Instrumento legal"><input name="reliefInstrument" maxLength={200} className={inputClass} /></Field>
            <Field label="Certificado de beneficio"><input name="reliefCertificate" maxLength={128} className={inputClass} /></Field>
            <Field label="Fecha de emisión"><input name="reliefIssuedAt" type="date" className={inputClass} /></Field>
          </div>
        </section>
        <label className="flex items-start gap-3 border-t border-border-light pt-5 text-sm"><input name="reconciled" type="checkbox" className="mt-1" /><span>He conciliado importes y referencias contra los documentos originales; puede considerarse en libros y borradores internos.</span></label>
        <Field label="Nota obligatoria si todavía no está conciliado"><input name="reviewReason" maxLength={500} className={inputClass} /></Field>
        <button type="submit" disabled={saving || !companyId} className="h-11 rounded-lg bg-primary-500 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Guardando…" : "Registrar evidencia revisada"}</button>
      </form>
    </main>
  </div>;
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }): React.JSX.Element {
  return <label className="grid gap-1.5 text-xs text-[var(--text-secondary)]">{label}{children}</label>;
}

const inputClass = "h-10 w-full rounded-lg border border-border-light bg-surface-1 px-3 text-sm text-foreground";

function text(form: FormData, key: string): string { return String(form.get(key) ?? "").trim(); }
function toMinor(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Usa importes positivos con máximo dos decimales.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt((fraction + "00").slice(0, 2));
}
function errorMessage(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return "No fue posible guardar el hecho de IVA.";
}
