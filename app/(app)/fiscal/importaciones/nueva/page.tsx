"use client";

import { useRef, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseCheckbox } from "@/src/shared/frontend/components/base-checkbox";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect } from "@/src/shared/frontend/components/base-select";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { ApiRequestFailure } from "@/src/shared/frontend/feedback/api-request-failure";

type ImportKind = "goods" | "foreign_service";
type ImportCategory = "taxable" | "zero_rated" | "exempt" | "exonerated" | "non_subject" | "unknown";
type DeductibleState = "eligible" | "ineligible" | "pending_review";

const STEPS = ["Tipo y documento", "Importes", "Crédito fiscal", "Beneficio", "Revisión"] as const;
const KIND_OPTIONS = [{ id: "goods", name: "Bienes (declaración aduanera)" }, { id: "foreign_service", name: "Servicio de proveedor extranjero" }];
const TAXABLE_CATEGORY_OPTIONS = [{ id: "taxable", name: "Gravada" }, { id: "zero_rated", name: "Tasa cero" }, { id: "exempt", name: "Exenta" }, { id: "exonerated", name: "Exonerada" }, { id: "non_subject", name: "No sujeta" }, { id: "unknown", name: "Pendiente de clasificar" }];
const OTHER_CATEGORY_OPTIONS = [{ id: "exempt", name: "Exenta" }, { id: "exonerated", name: "Exonerada" }, { id: "zero_rated", name: "Tasa cero" }, { id: "non_subject", name: "No sujeta" }, { id: "unknown", name: "Pendiente de clasificar" }];
const DEDUCTIBLE_OPTIONS = [{ id: "pending_review", name: "Pendiente de revisión (por defecto)" }, { id: "eligible", name: "Elegible según revisión profesional" }, { id: "ineligible", name: "No elegible" }];

/** Captures a manually reviewed import assessment and sends it to the shared tax-reporting API.
 * @returns The company-scoped import review form.
 */
export default function IvaImportsPage(): React.JSX.Element {
  const { companyId } = useCompany();
  const [kind, setKind] = useState<ImportKind>("goods");
  const [step, setStep] = useState(0);
  const [amounts, setAmounts] = useState({ taxableBase: "0", exemptBase: "0", taxAmount: "0" });
  const [taxableCategory, setTaxableCategory] = useState<ImportCategory>("taxable");
  const [exemptCategory, setExemptCategory] = useState<ImportCategory>("exempt");
  const [deductibleState, setDeductibleState] = useState<DeductibleState>("pending_review");
  const [reconciled, setReconciled] = useState(false);
  // Relief evidence is only requested when a base is classified as exonerated.
  const hasExoneratedCategory = taxableCategory === "exonerated" || exemptCategory === "exonerated";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const pendingSubmission = useRef<{ readonly fingerprint: string; readonly key: string; readonly body: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const invalid = Array.from(formElement.querySelectorAll<HTMLInputElement>("input")).find((field) => !field.disabled && !field.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    setError(null);
    setSaved(false);
    if (!companyId) { setError("Selecciona una empresa antes de registrar la importación."); return; }
    const form = new FormData(formElement);
    try {
      if (!reconciled && !text(form, "reviewReason")) throw new Error("Agrega una nota de revisión cuando el documento no está conciliado.");
      const documentDate = text(form, "documentDate");
      const recognitionDate = text(form, "recognitionDate");
      const currency = { code: "VES", minorUnit: 2 };
      const taxableMinor = toMinor(text(form, "taxableBase"));
      const exemptMinor = toMinor(text(form, "exemptBase"));
      const taxMinor = toMinor(text(form, "taxAmount"));
      const deductibleMinor = deductibleState === "eligible" ? toMinor(text(form, "deductibleAmount")) : 0n;
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
        reconciliation: reconciled
          ? { state: "reconciled", reason: null, expectedTaxAmount: null }
          : { state: "issue", reason: text(form, "reviewReason") || "Importes pendientes de conciliación documental.", expectedTaxAmount: null },
        recordedAt: new Date().toISOString(),
      };
      const fingerprint = JSON.stringify([Array.from(form.entries()), kind, taxableCategory, exemptCategory, deductibleState, reconciled]);
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
      if (!response.ok) throw new ApiRequestFailure(response, errorMessage(body), body);
      pendingSubmission.current = null;
      setSaved(true);
      formElement.reset();
      setKind("goods"); setStep(0); setAmounts({ taxableBase: "0", exemptBase: "0", taxAmount: "0" });
      setTaxableCategory("taxable"); setExemptCategory("exempt"); setDeductibleState("pending_review"); setReconciled(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible registrar la evidencia de importación.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="min-h-full bg-surface-2">
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
        <p className="text-sm font-semibold sm:hidden">Paso {step + 1} de {STEPS.length} · {STEPS[step]}</p>
        <ol aria-label="Pasos de importación" className="hidden grid-cols-5 gap-2 sm:grid">{STEPS.map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`rounded-lg px-2 py-3 text-center text-xs ${step === index ? "bg-primary-500 font-semibold text-white" : "bg-surface-2 text-[var(--text-secondary)]"}`}><span className="mr-1">{index + 1}.</span>{label}{index === 3 && !hasExoneratedCategory ? " (si aplica)" : ""}</li>)}</ol>
        <fieldset hidden={step !== 0} className="grid gap-4 sm:grid-cols-2">
          <BaseSelect label="Tipo de importación" selectionMode="single" items={KIND_OPTIONS} value={kind} onValueChange={(value) => value && setKind(value as ImportKind)} />
          <BaseInput.Field label="Contraparte / proveedor" name="counterparty" isRequired maxLength={200} />
          <BaseInput.Field label="Fecha del documento" name="documentDate" type="date" isRequired />
          <BaseInput.Field label="Fecha de reconocimiento IVA" name="recognitionDate" type="date" isRequired />
          {kind === "goods" ? <>
            <BaseInput.Field label="Número de declaración" name="declarationNumber" isRequired maxLength={128} />
            <BaseInput.Field label="Fecha de declaración" name="declaredAt" type="date" isRequired />
            <BaseInput.Field label="Autoridad aduanera" name="authority" isRequired maxLength={128} />
            <BaseInput.Field label="Código arancelario" name="tariffCode" isRequired maxLength={32} />
            <BaseInput.Field label="Referencia de pago de tributos" name="paymentReference" isRequired maxLength={128} />
            <BaseInput.Field label="Referencia aduanera adicional" name="customsReference" maxLength={128} />
          </> : <>
            <BaseInput.Field label="Referencia de factura extranjera" name="invoiceReference" isRequired maxLength={128} />
            <BaseInput.Field label="Fecha del servicio" name="serviceDate" type="date" isRequired />
            <BaseInput.Field label="País del proveedor (ISO 3166-1 alfa-2)" name="providerCountryCode" isRequired minLength={2} maxLength={2} pattern="[A-Za-z]{2}" inputClassName="uppercase" />
            <BaseInput.Field label="Referencia del pago de IVA" name="paymentReference" isRequired maxLength={128} />
          </>}
          <BaseInput.Field label="Fecha y hora del pago" name="paidAt" type="datetime-local" isRequired />
        </fieldset>

        <fieldset hidden={step !== 1} className="space-y-3 border-t border-border-light pt-5">
          <h2 className="text-sm font-bold">Importes revisados</h2>
          <p className="text-xs text-[var(--text-secondary)]">Copia el desglose ya determinado en los soportes. No se calcula IVA en esta pantalla.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <BaseInput.Field label="Base sujeta / de la categoría" name="taxableBase" inputMode="decimal" prefix="Bs." inputClassName="text-right" isRequired pattern="\d+(\.\d{1,2})?" value={amounts.taxableBase} onValueChange={(taxableBase) => setAmounts((current) => ({ ...current, taxableBase }))} />
            <BaseSelect label="Categoría de esa base" selectionMode="single" items={TAXABLE_CATEGORY_OPTIONS} value={taxableCategory} onValueChange={(value) => value && setTaxableCategory(value as ImportCategory)} />
            <BaseInput.Field label="Tasa histórica documentada" name="taxableRate" inputMode="decimal" suffix="%" inputClassName="text-right" defaultValue="0" isRequired pattern="\d+(\.\d+)?" />
            <BaseInput.Field label="IVA liquidado según soporte" name="taxAmount" inputMode="decimal" prefix="Bs." inputClassName="text-right" isRequired pattern="\d+(\.\d{1,2})?" value={amounts.taxAmount} onValueChange={(taxAmount) => setAmounts((current) => ({ ...current, taxAmount }))} />
            <BaseInput.Field label="Otra base: exenta / no sujeta / exonerada" name="exemptBase" inputMode="decimal" prefix="Bs." inputClassName="text-right" isRequired pattern="\d+(\.\d{1,2})?" value={amounts.exemptBase} onValueChange={(exemptBase) => setAmounts((current) => ({ ...current, exemptBase }))} />
            <BaseSelect label="Categoría de la otra base" selectionMode="single" items={OTHER_CATEGORY_OPTIONS} value={exemptCategory} onValueChange={(value) => value && setExemptCategory(value as ImportCategory)} />
          </div>
          <p className="rounded-lg bg-surface-2 p-3 text-sm">Total transcrito para cotejo: <strong>Bs {previewTotal(amounts)}</strong>. El cálculo solo suma los importes ingresados; no determina IVA.</p>
        </fieldset>

        <fieldset hidden={step !== 2} className="space-y-3 border-t border-border-light pt-5">
          <h2 className="text-sm font-bold">Crédito fiscal soportado</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <BaseSelect label="Estado de revisión" selectionMode="single" items={DEDUCTIBLE_OPTIONS} value={deductibleState} onValueChange={(value) => value && setDeductibleState(value as DeductibleState)} />
            <BaseInput.Field label="Monto deducible si fue aprobado" name="deductibleAmount" inputMode="decimal" prefix="Bs." inputClassName="text-right" defaultValue="0" pattern="\d+(\.\d{1,2})?" isDisabled={deductibleState !== "eligible"} />
            <BaseInput.Field label="Fundamento / nota de revisión" name="deductibleReason" maxLength={500} className="sm:col-span-2" />
          </div>
        </fieldset>

        <fieldset hidden={step !== 3 || !hasExoneratedCategory} className="space-y-3 border-t border-border-light pt-5">
          <h2 className="text-sm font-bold">Beneficio de importación</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <BaseInput.Field label="Instrumento legal" name="reliefInstrument" maxLength={200} />
            <BaseInput.Field label="Certificado de beneficio" name="reliefCertificate" maxLength={128} />
            <BaseInput.Field label="Fecha de emisión" name="reliefIssuedAt" type="date" />
          </div>
        </fieldset>
        <fieldset hidden={step !== 4} className="space-y-4 border-t border-border-light pt-5">
          <h2 className="text-sm font-bold">Revisión y confirmación</h2>
          <p className="text-sm">Tipo: {kind === "goods" ? "Bienes" : "Servicio del exterior"} · Total transcrito: Bs {previewTotal(amounts)} · Crédito: {deductibleLabel(deductibleState)}.</p>
          <div className="flex items-start gap-3 text-sm"><BaseCheckbox.Field aria-label="Importes conciliados" isSelected={reconciled} onValueChange={setReconciled} className="!w-auto pt-0.5" /><span>He conciliado importes y referencias contra los documentos originales; puede considerarse en libros y borradores internos.</span></div>
          <BaseInput.Field label={reconciled ? "Nota de revisión (opcional)" : "Nota de revisión"} name="reviewReason" maxLength={500} isRequired={!reconciled} />
        </fieldset>
        <div className="flex flex-wrap justify-between gap-3">{step > 0 && <BaseButton.Root variant="secondary" onPress={() => setStep((current) => current === 4 && !hasExoneratedCategory ? 2 : Math.max(0, current - 1))}>Anterior</BaseButton.Root>}{step < 4 ? <BaseButton.Root className="ml-auto" variant="primary" onPress={() => { const invalid = document.querySelector<HTMLInputElement>("form fieldset:not([hidden]) input:invalid"); if (invalid) invalid.reportValidity(); else setStep((current) => current === 2 && !hasExoneratedCategory ? 4 : current + 1); }}>Continuar</BaseButton.Root> : <BaseButton.Root className="ml-auto" type="submit" variant="primary" loading={saving} isDisabled={!companyId}>Registrar evidencia revisada</BaseButton.Root>}</div>
      </form>
    </main>
  </div>;
}

function deductibleLabel(state: DeductibleState): string { return state === "eligible" ? "elegible" : state === "ineligible" ? "no elegible" : "pendiente de revisión"; }

function text(form: FormData, key: string): string { return String(form.get(key) ?? "").trim(); }
function previewTotal(amounts: { readonly taxableBase: string; readonly exemptBase: string; readonly taxAmount: string }): string {
  try {
    const cents = [amounts.taxableBase, amounts.exemptBase, amounts.taxAmount].reduce((sum, value) => sum + toMinor(value), 0n);
    return `${new Intl.NumberFormat("es-VE").format(cents / 100n)},${(cents % 100n).toString().padStart(2, "0")}`;
  } catch { return "—"; }
}
function toMinor(value: string): bigint {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error("Usa importes positivos con máximo dos decimales.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt((fraction + "00").slice(0, 2));
}
function errorMessage(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return "No fue posible guardar el hecho de IVA.";
}
