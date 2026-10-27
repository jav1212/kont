"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDecimal, compareDecimal, exactDecimal, subtractDecimal } from "@kontave/monetary/domain";
import { splitInstallmentAmounts } from "@kontave/payables/domain";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";
import { ResponsiveDrawer } from "@/src/shared/frontend/components/responsive-drawer";
import { notify } from "@/src/shared/frontend/notify";
import { executePayablesCommand, formatPayablesAmount, newPayablesId, PAYABLE_APPLICATION_LABELS, PAYABLE_KIND_LABELS, PAYABLE_STATUS_LABELS, payablesToday, queryPayables, type PayablesRequestScope } from "./payables-client";

interface Detail {
  readonly document: { readonly id: string; readonly supplierId: string; readonly supplierName: string | null; readonly kind: string; readonly side: "debit" | "credit"; readonly parentDocumentId: string | null; readonly documentNumber: string; readonly concept: string; readonly reason: string | null; readonly evidence: string | null; readonly issuedAt: string; readonly dueAt: string; readonly currency: string; readonly principal: string; readonly rate: string; readonly rateSource: string; readonly approvalStatus: string; readonly status: string; readonly version: number };
  readonly openAmount: string;
  readonly reserved: string;
  readonly applications: readonly { readonly id: string; readonly kind: string; readonly documentId: string; readonly creditDocumentId: string | null; readonly paymentId: string | null; readonly amount: string; readonly occurredAt: string; readonly reversedAt: string | null; readonly reversalReason: string | null; readonly reversible: boolean }[];
  readonly withholdings: readonly { readonly id: string; readonly kind: string; readonly receiptNumber: string; readonly amountVes: string; readonly status: string; readonly issuedAt: string; readonly late: boolean }[];
  readonly dueDateChanges: readonly { readonly id: string; readonly previousDueAt: string; readonly dueAt: string; readonly reason: string; readonly changedAt: string }[];
  readonly installmentPlans: readonly { readonly id: string; readonly status: string; readonly version: number; readonly transferredAmount: string; readonly createdAt: string; readonly undoReason: string | null }[];
  readonly children: readonly { readonly documentId: string; readonly kind: string; readonly documentNumber: string; readonly dueAt: string; readonly principal: string; readonly balance: string; readonly status: string }[];
  readonly counterparts: readonly { readonly documentId: string; readonly kind: string; readonly documentNumber: string; readonly dueAt: string; readonly balance: string }[];
}
type Panel = { readonly kind: "due" } | { readonly kind: "apply" } | { readonly kind: "installments" } | { readonly kind: "undo"; readonly planId: string; readonly version: number } | { readonly kind: "reverse"; readonly applicationId: string };
const CONTROL = "rounded-lg border border-default-300 bg-background px-3 py-2";
const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** Shows one payable document with its history and the CXP-007–012 operations allowed on it.
 * @param props - Document identifier from the route.
 * @returns The document page.
 */
export function PayablesDocumentDetail({ documentId }: { readonly documentId: string }): React.JSX.Element {
  const { companyId } = useCompany();
  const { organization } = useOrganization();
  const { can } = useOrganizationModuleAccess("/payables");
  const organizationId = organization?.id;
  const scope = useMemo<PayablesRequestScope | null>(() => companyId && organizationId ? { organizationId, companyId } : null, [companyId, organizationId]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!scope) return;
    let active = true;
    void queryPayables<Detail>(scope, { kind: "document_detail", documentId })
      .then((result) => { if (active) { setError(null); setDetail(result.rows[0] ?? null); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el documento."); });
    return () => { active = false; };
  }, [scope, documentId, revision]);
  const done = (message: string) => { notify.success(message); setPanel(null); setRevision((value) => value + 1); };

  if (error) return <main className="mx-auto max-w-5xl p-6"><p role="alert" className="text-danger">{error}</p><Link className="text-primary underline" href="/payables/documents">Volver a documentos</Link></main>;
  if (!detail || !scope) return <main className="mx-auto max-w-5xl p-6"><p role="status">Cargando…</p></main>;
  const { document } = detail;
  const open = document.status === "open";
  const adjust = can("payables.adjust");
  const canSplit = adjust && open && document.side === "debit" && document.kind !== "installment" && compareDecimal(exactDecimal(detail.reserved), exactDecimal("0")) === 0;

  return <main className="mx-auto max-w-5xl space-y-6 p-6">
    <header className="space-y-2">
      <Link className="text-sm text-primary underline" href="/payables/documents">Documentos</Link>
      <h1 className="text-3xl font-semibold">{PAYABLE_KIND_LABELS[document.kind] ?? document.kind} {document.documentNumber}</h1>
      <p className="text-[var(--text-secondary)]"><Link className="hover:underline" href={`/payables/suppliers/${encodeURIComponent(document.supplierId)}`}>{document.supplierName ?? document.supplierId}</Link> · {document.concept}</p>
    </header>
    <section className="grid gap-3 sm:grid-cols-4">
      <Fact label="Estado" value={PAYABLE_STATUS_LABELS[document.status] ?? document.status} />
      <Fact label="Principal" value={`${formatPayablesAmount(document.principal)} ${document.currency}`} />
      <Fact label={document.side === "credit" ? "Crédito disponible" : "Saldo"} value={`${formatPayablesAmount(detail.openAmount)} ${document.currency}`} />
      <Fact label={document.side === "credit" ? "Emisión" : "Vencimiento"} value={document.side === "credit" ? document.issuedAt : document.dueAt} />
    </section>
    <p className="text-sm text-[var(--text-secondary)]">Emitido el {document.issuedAt}. Tasa {document.rate} VES ({document.rateSource}).{compareDecimal(exactDecimal(detail.reserved), exactDecimal("0")) > 0 && ` Reservado en lotes de pago: ${formatPayablesAmount(detail.reserved)}.`}{document.reason && ` Motivo: ${document.reason}.`}{document.evidence && ` Evidencia: ${document.evidence}.`}{document.parentDocumentId && <> Origen: <Link className="text-primary underline" href={`/payables/documents/${encodeURIComponent(document.parentDocumentId)}`}>ver documento</Link>.</>}</p>
    {document.approvalStatus === "pending" && <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning bg-warning/10 p-4 text-sm"><span>Este ajuste supera el umbral de la empresa y necesita la aprobación de otro usuario.</span>
      {can("payables.authorize") && <><button type="button" className="rounded-lg bg-primary px-3 py-1.5 text-white" onClick={() => void executePayablesCommand(scope, { kind: "decide_adjustment", documentId: document.id, decision: "approved" }).then(() => done("Ajuste aprobado.")).catch((cause: unknown) => notify.failure(cause, "No se pudo aprobar."))}>Aprobar</button>
        <button type="button" className="rounded-lg border border-danger px-3 py-1.5 text-danger" onClick={() => void executePayablesCommand(scope, { kind: "decide_adjustment", documentId: document.id, decision: "rejected" }).then(() => done("Ajuste rechazado y anulado.")).catch((cause: unknown) => notify.failure(cause, "No se pudo rechazar."))}>Rechazar</button></>}</div>}
    {open && document.side === "debit" && can("payables.post") && <Link href={`/payables/payments?supplierId=${encodeURIComponent(document.supplierId)}`} className="inline-block rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">Pagar</Link>}
    {adjust && open && <nav aria-label="Operaciones" className="flex flex-wrap gap-2">
      {document.side === "debit" && <Action onClick={() => setPanel({ kind: "due" })}>Cambiar vencimiento</Action>}
      {detail.counterparts.length > 0 && <Action onClick={() => setPanel({ kind: "apply" })}>{document.side === "credit" ? "Aplicar crédito" : "Aplicar nota de crédito o ajuste"}</Action>}
      {canSplit && <Action onClick={() => setPanel({ kind: "installments" })}>Crear giros</Action>}
    </nav>}

    <Section title="Aplicaciones">{detail.applications.length === 0 ? <Empty /> : <table className="w-full text-left text-sm"><thead><tr>{["Fecha", "Tipo", document.side === "credit" ? "Aplicada a" : "Crédito", "Importe", "Estado", ""].map((label) => <th key={label} className="border-b border-border-light px-4 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{detail.applications.map((application) => {
      const other = document.side === "credit" ? application.documentId : application.creditDocumentId;
      return <tr key={application.id} className={application.reversedAt ? "text-[var(--text-secondary)] line-through" : undefined}>
        <td className="border-b border-border-light px-4 py-2">{application.occurredAt}</td>
        <td className="border-b border-border-light px-4 py-2">{PAYABLE_APPLICATION_LABELS[application.kind] ?? application.kind}</td>
        <td className="border-b border-border-light px-4 py-2">{other ? <Link className="text-primary underline" href={`/payables/documents/${encodeURIComponent(other)}`}>ver</Link> : application.paymentId ? <Link className="text-primary underline" href={`/payables/payments?paymentId=${encodeURIComponent(application.paymentId)}`}>pago</Link> : "—"}</td>
        <td className="border-b border-border-light px-4 py-2 text-right tabular-nums">{formatPayablesAmount(application.amount)}</td>
        <td className="border-b border-border-light px-4 py-2">{application.reversedAt ? `Reversada: ${application.reversalReason ?? ""}` : "Vigente"}</td>
        <td className="border-b border-border-light px-4 py-2 text-right">{adjust && application.reversible && <button type="button" className="text-sm text-danger underline" onClick={() => setPanel({ kind: "reverse", applicationId: application.id })}>Reversar</button>}</td>
      </tr>;
    })}</tbody></table>}</Section>

    {detail.withholdings.length > 0 && <Section title="Retenciones emitidas al pagar"><ul className="divide-y divide-border-light text-sm">{detail.withholdings.map((item) => <li key={item.id} className="px-4 py-2">{item.kind === "vat" ? "IVA" : "ISLR"} N° {item.receiptNumber} · {item.issuedAt} · {formatPayablesAmount(item.amountVes)} Bs · {item.status === "voided" ? "anulada" : item.status === "declared" ? "declarada" : "emitida"}{item.late && " · extemporánea"}</li>)}</ul></Section>}
    {detail.installmentPlans.length > 0 && <Section title="Giros">{detail.installmentPlans.map((plan) => <div key={plan.id} className="flex items-center justify-between border-b border-border-light px-4 py-2 text-sm"><span>Plan del {plan.createdAt.slice(0, 10)} por {formatPayablesAmount(plan.transferredAmount)} · {plan.status === "active" ? "Vigente" : `Deshecho: ${plan.undoReason ?? ""}`}</span>{adjust && plan.status === "active" && <button type="button" className="text-danger underline" onClick={() => setPanel({ kind: "undo", planId: plan.id, version: plan.version })}>Deshacer giros</button>}</div>)}</Section>}
    {detail.children.length > 0 && <Section title="Documentos derivados"><table className="w-full text-left text-sm"><tbody>{detail.children.map((child) => <tr key={child.documentId}><td className="border-b border-border-light px-4 py-2"><Link className="text-primary underline" href={`/payables/documents/${encodeURIComponent(child.documentId)}`}>{child.documentNumber || PAYABLE_KIND_LABELS[child.kind]}</Link></td><td className="border-b border-border-light px-4 py-2">{PAYABLE_KIND_LABELS[child.kind] ?? child.kind}</td><td className="border-b border-border-light px-4 py-2">{child.dueAt}</td><td className="border-b border-border-light px-4 py-2 text-right tabular-nums">{formatPayablesAmount(child.balance)}</td><td className="border-b border-border-light px-4 py-2">{PAYABLE_STATUS_LABELS[child.status] ?? child.status}</td></tr>)}</tbody></table></Section>}
    {detail.dueDateChanges.length > 0 && <Section title="Cambios de vencimiento"><ul className="divide-y divide-border-light text-sm">{detail.dueDateChanges.map((change) => <li key={change.id} className="px-4 py-2">{change.previousDueAt} → {change.dueAt} · {change.reason} <span className="text-[var(--text-secondary)]">({change.changedAt.slice(0, 10)})</span></li>)}</ul></Section>}

    {panel?.kind === "due" && <DueDatePanel scope={scope} detail={detail} onClose={() => setPanel(null)} onDone={() => done("Vencimiento actualizado.")} />}
    {panel?.kind === "apply" && <ApplyCreditPanel scope={scope} detail={detail} onClose={() => setPanel(null)} onDone={() => done("Crédito aplicado.")} />}
    {panel?.kind === "installments" && <InstallmentsPanel scope={scope} detail={detail} onClose={() => setPanel(null)} onDone={() => done("Giros creados.")} />}
    {(panel?.kind === "undo" || panel?.kind === "reverse") && <ReasonPanel title={panel.kind === "undo" ? "Deshacer giros" : "Reversar aplicación"} help={panel.kind === "undo" ? "Se anulan los giros y el saldo vuelve al documento original. Solo es posible si ningún giro tiene aplicaciones ni reservas." : "La aplicación queda registrada como reversada y los saldos de ambos documentos se reabren."} onClose={() => setPanel(null)}
      onSubmit={(reason) => executePayablesCommand(scope, panel.kind === "undo" ? { kind: "undo_installment_plan", planId: panel.planId, expectedVersion: panel.version, reason } : { kind: "reverse_credit_application", applicationId: panel.applicationId, reason }).then(() => done(panel.kind === "undo" ? "Giros deshechos." : "Aplicación reversada."))} />}
  </main>;
}

function DueDatePanel({ scope, detail, onClose, onDone }: PanelProps): React.JSX.Element {
  const [dueAt, setDueAt] = useState(detail.document.dueAt);
  const [reason, setReason] = useState("");
  return <FormPanel title="Cambiar vencimiento" onClose={onClose} onSubmit={() => executePayablesCommand(scope, { kind: "change_due_date", changeId: newPayablesId(), documentId: detail.document.id, dueAt, reason: reason.trim(), expectedVersion: detail.document.version }).then(onDone)}>
    <label className="grid gap-1">Nuevo vencimiento<input required type="date" min={detail.document.issuedAt} value={dueAt} onChange={(event) => setDueAt(event.target.value)} className={CONTROL} /></label>
    <label className="grid gap-1">Motivo<textarea required value={reason} onChange={(event) => setReason(event.target.value)} className={CONTROL} /></label>
  </FormPanel>;
}

function ApplyCreditPanel({ scope, detail, onClose, onDone }: PanelProps): React.JSX.Element {
  const isCredit = detail.document.side === "credit";
  const [amounts, setAmounts] = useState<Readonly<Record<string, string>>>({});
  const [occurredAt, setOccurredAt] = useState(payablesToday());
  const entered = Object.entries(amounts).filter(([, value]) => value.trim() !== "");
  const valid = entered.length > 0 && entered.every(([, value]) => AMOUNT.test(value.trim()) && compareDecimal(exactDecimal(value.trim()), exactDecimal("0")) > 0);
  const total = valid ? entered.reduce((sum, [, value]) => addDecimal(sum, exactDecimal(value.trim())), exactDecimal("0")) : null;
  async function submit(): Promise<void> {
    // A debit document receives one credit per command; a credit may be spread over several debts.
    if (isCredit) {
      await executePayablesCommand(scope, { kind: "apply_credit", creditDocumentId: detail.document.id, occurredAt, allocations: entered.map(([documentId, amount]) => ({ applicationId: newPayablesId(), documentId, amount: amount.trim() })) });
    } else {
      for (const [creditDocumentId, amount] of entered) await executePayablesCommand(scope, { kind: "apply_credit", creditDocumentId, occurredAt, allocations: [{ applicationId: newPayablesId(), documentId: detail.document.id, amount: amount.trim() }] });
    }
    onDone();
  }
  return <FormPanel title={isCredit ? "Aplicar crédito a documentos" : "Aplicar créditos a este documento"} onClose={onClose} onSubmit={submit} disabled={!valid}>
    <p className="text-[var(--text-secondary)]">{isCredit ? `Crédito disponible: ${formatPayablesAmount(detail.openAmount)} ${detail.document.currency}.` : `Saldo aplicable: ${formatPayablesAmount(subtractDecimal(exactDecimal(detail.openAmount), exactDecimal(detail.reserved)))} ${detail.document.currency}.`} Solo se muestran documentos abiertos del mismo proveedor y moneda.</p>
    <label className="grid gap-1">Fecha de aplicación<input required type="date" min={detail.document.issuedAt} value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} className={CONTROL} /></label>
    <table className="w-full text-left"><thead><tr><th className="py-1 font-medium">{isCredit ? "Documento" : "Crédito"}</th><th className="py-1 font-medium">Disponible</th><th className="py-1 font-medium">Importe</th></tr></thead><tbody>{detail.counterparts.map((counterpart) => <tr key={counterpart.documentId}>
      <td className="py-1">{PAYABLE_KIND_LABELS[counterpart.kind] ?? counterpart.kind} {counterpart.documentNumber}{isCredit && <span className="block text-xs text-[var(--text-secondary)]">Vence {counterpart.dueAt}</span>}</td>
      <td className="py-1 tabular-nums">{formatPayablesAmount(counterpart.balance)}</td>
      <td className="py-1"><input inputMode="decimal" placeholder="0.00" value={amounts[counterpart.documentId] ?? ""} onChange={(event) => setAmounts((current) => ({ ...current, [counterpart.documentId]: event.target.value }))} className={`${CONTROL} w-32`} aria-label={`Importe para ${counterpart.documentNumber || counterpart.documentId}`} /></td>
    </tr>)}</tbody></table>
    {total && <p className="font-medium">Total a aplicar: {formatPayablesAmount(total)} {detail.document.currency}</p>}
  </FormPanel>;
}

function InstallmentsPanel({ scope, detail, onClose, onDone }: PanelProps): React.JSX.Element {
  const [count, setCount] = useState(2);
  const [rows, setRows] = useState<readonly { readonly amount: string; readonly dueAt: string }[]>(() => plan(detail, 2));
  const sum = rows.every((row) => AMOUNT.test(row.amount)) ? rows.reduce((total, row) => addDecimal(total, exactDecimal(row.amount)), exactDecimal("0")) : null;
  const exact = sum !== null && compareDecimal(sum, exactDecimal(detail.openAmount)) === 0;
  return <FormPanel title="Crear giros" onClose={onClose} disabled={!exact} onSubmit={() => executePayablesCommand(scope, { kind: "create_installment_plan", planId: newPayablesId(), documentId: detail.document.id, expectedVersion: detail.document.version, installments: rows.map((row) => ({ documentId: newPayablesId(), amount: row.amount, dueAt: row.dueAt })) }).then(onDone)}>
    <p className="text-[var(--text-secondary)]">Todo el saldo ({formatPayablesAmount(detail.openAmount)} {detail.document.currency}) pasa a los giros. El residuo de redondeo queda en el último giro.</p>
    <label className="grid gap-1">Cantidad de giros<input type="number" min={2} max={60} value={count} onChange={(event) => { const next = Math.min(60, Math.max(2, Number(event.target.value) || 2)); setCount(next); setRows(plan(detail, next)); }} className={`${CONTROL} w-32`} /></label>
    <table className="w-full text-left"><thead><tr><th className="py-1 font-medium">Giro</th><th className="py-1 font-medium">Vencimiento</th><th className="py-1 font-medium">Importe</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}>
      <td className="py-1">{index + 1}/{rows.length}</td>
      <td className="py-1"><input type="date" required min={detail.document.issuedAt} value={row.dueAt} onChange={(event) => setRows((current) => current.map((item, position) => position === index ? { ...item, dueAt: event.target.value } : item))} className={CONTROL} /></td>
      <td className="py-1"><input inputMode="decimal" required value={row.amount} onChange={(event) => setRows((current) => current.map((item, position) => position === index ? { ...item, amount: event.target.value } : item))} className={`${CONTROL} w-32`} /></td>
    </tr>)}</tbody></table>
    <p className={exact ? "text-[var(--text-secondary)]" : "text-danger"}>Suma: {sum ? formatPayablesAmount(sum) : "—"} {exact ? "" : "· debe ser igual al saldo"}</p>
  </FormPanel>;
}

function plan(detail: Detail, count: number): readonly { readonly amount: string; readonly dueAt: string }[] {
  const amounts = splitInstallmentAmounts(exactDecimal(detail.openAmount), count);
  const [year = 0, month = 1, day = 1] = detail.document.dueAt.split("-").map(Number);
  // Consecutive months from the current due date, clamped to each month's last day.
  return amounts.map((amount, index) => {
    const last = new Date(Date.UTC(year, month + index, 0)).getUTCDate();
    const date = new Date(Date.UTC(year, month - 1 + index, Math.min(day, last)));
    return { amount, dueAt: date.toISOString().slice(0, 10) };
  });
}

interface PanelProps { readonly scope: PayablesRequestScope; readonly detail: Detail; readonly onClose: () => void; readonly onDone: () => void }

function ReasonPanel({ title, help, onClose, onSubmit }: { readonly title: string; readonly help: string; readonly onClose: () => void; readonly onSubmit: (reason: string) => Promise<void> }): React.JSX.Element {
  const [reason, setReason] = useState("");
  return <FormPanel title={title} onClose={onClose} onSubmit={() => onSubmit(reason.trim())}>
    <p className="text-[var(--text-secondary)]">{help}</p>
    <label className="grid gap-1">Motivo<textarea required value={reason} onChange={(event) => setReason(event.target.value)} className={CONTROL} /></label>
  </FormPanel>;
}

function FormPanel({ title, onClose, onSubmit, disabled, children }: { readonly title: string; readonly onClose: () => void; readonly onSubmit: () => Promise<void>; readonly disabled?: boolean; readonly children: React.ReactNode }): React.JSX.Element {
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try { await onSubmit(); }
    catch (cause: unknown) { notify.failure(cause, "No se pudo registrar la operación."); }
    finally { setSaving(false); }
  }
  return <ResponsiveDrawer isOpen onClose={onClose} title={title} footer={<div className="flex justify-end gap-2 p-4"><button type="button" className="rounded-lg border border-border-light px-3 py-2 text-sm" onClick={onClose}>Cancelar</button><button form="payables-panel" type="submit" disabled={saving || disabled} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Guardando…" : "Confirmar"}</button></div>}>
    <form id="payables-panel" onSubmit={(event) => void submit(event)} className="grid gap-4 p-5 text-sm">{children}</form>
  </ResponsiveDrawer>;
}

function Fact({ label, value }: { readonly label: string; readonly value: string }): React.JSX.Element {
  return <div className="rounded-xl border border-border-light bg-surface-1 p-4"><p className="text-sm text-[var(--text-secondary)]">{label}</p><p className="text-lg font-semibold tabular-nums">{value}</p></div>;
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }): React.JSX.Element {
  return <section className="overflow-hidden rounded-xl border border-border-light bg-surface-1"><h2 className="border-b border-border-light p-4 font-semibold">{title}</h2><div className="overflow-x-auto">{children}</div></section>;
}

function Action({ onClick, children }: { readonly onClick: () => void; readonly children: React.ReactNode }): React.JSX.Element {
  return <button type="button" onClick={onClick} className="rounded-lg border border-border-light px-3 py-2 text-sm hover:bg-default-100">{children}</button>;
}

function Empty(): React.JSX.Element {
  return <p className="p-4 text-sm text-[var(--text-secondary)]">Sin aplicaciones.</p>;
}
