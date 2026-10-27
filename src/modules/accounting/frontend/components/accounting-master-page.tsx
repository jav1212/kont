"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { createWebAccountingClient } from "../accounting-client";
import type { AccountingCommandRequest } from "@kontave/client-contracts";

export interface AccountingPageField {
  readonly name: string;
  readonly label: string;
  readonly values?: readonly string[];
}

export interface AccountingMasterPageProps {
  readonly title: string;
  readonly description: string;
  readonly query: Readonly<Record<string, unknown>>;
  readonly columns: readonly { readonly key: string; readonly label: string }[];
  readonly command?: string;
  readonly idField?: string;
  readonly fields?: readonly AccountingPageField[];
  readonly commandDefaults?: Readonly<Record<string, unknown>>;
  readonly rowActions?: readonly AccountingPageRowAction[];
  readonly additionalCommands?: readonly AccountingAdditionalCommand[];
}

/** One secondary creation form rendered above the master table. */
export interface AccountingAdditionalCommand {
  readonly title: string;
  readonly command: string;
  readonly idField: string;
  readonly fields: readonly AccountingPageField[];
  readonly commandDefaults?: Readonly<Record<string, unknown>>;
}

export interface AccountingPageRowAction {
  readonly label: string;
  readonly kind: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly toggleField?: string;
}

/** Renders an authenticated, company-scoped accounting master query and command form.
 * @param props - Route copy, query kind, visible columns and optional command fields.
 * @returns A searchable-by-refresh master page with server-authorized writes.
 * @throws Never; expected transport errors are shown inline.
 */
export function AccountingMasterPage(props: AccountingMasterPageProps): React.JSX.Element {
  const { organization } = useOrganization();
  const { company } = useCompany();
  const client = useMemo(() => createWebAccountingClient(), []);
  const queryJson = JSON.stringify(props.query);
  const query = useMemo(() => JSON.parse(queryJson) as { kind: string } & Record<string, unknown>, [queryJson]);
  const [rows, setRows] = useState<readonly Readonly<Record<string, unknown>>[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!organization || !company) { setRows([]); return; }
    setBusy(true); setError(null);
    try {
      const result = await client.query(organization.id, company.id, query);
      setRows(Array.isArray(result) ? result : result && typeof result === "object" ? [result] : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar la información contable."); }
    finally { setBusy(false); }
  }, [client, company, organization, query]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: React.FormEvent<HTMLFormElement>, spec: AccountingAdditionalCommand): Promise<void> {
    event.preventDefault();
    if (!organization || !company) return;
    setBusy(true); setError(null);
    const nowId = crypto.randomUUID();
    const fields = Object.fromEntries(spec.fields.map((field) => [field.name, values[field.name] ?? ""]));
    const id = values[spec.idField] || crypto.randomUUID();
    const command = { ...spec.commandDefaults, ...fields, [spec.idField]: id, kind: spec.command, idempotencyKey: nowId, correlationId: nowId };
    try { await client.command(organization.id, company.id, command); setValues({}); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la información contable."); }
    finally { setBusy(false); }
  }
  async function runRowAction(action: AccountingPageRowAction, row: Readonly<Record<string, unknown>>): Promise<void> {
    if (!organization || !company) return;
    const command: { kind: string; idempotencyKey: string; correlationId: string; [key: string]: unknown } = { kind: action.kind, idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID() };
    for (const [field, rowKey] of Object.entries(action.fields)) command[field] = row[rowKey];
    if (action.toggleField) command[action.toggleField] = !Boolean(row[action.toggleField]);
    setBusy(true); setError(null);
    try { await client.command(organization.id, company.id, command as AccountingCommandRequest); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo actualizar el registro."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
    <PageHeader title={props.title} subtitle={props.description} />
    {!company && <p className="rounded-xl bg-warning-50 p-4 text-sm text-warning-800">Selecciona una empresa para consultar sus maestros contables.</p>}
    {error && <p role="alert" className="rounded-xl bg-danger-50 p-4 text-sm text-danger-700">{error}</p>}
    {props.command && <CommandForm title={props.title} spec={{ title: props.title, command: props.command, idField: props.idField ?? "id", fields: props.fields ?? [], commandDefaults: props.commandDefaults }} values={values} setValues={setValues} busy={busy} disabled={!company || !organization} onSubmit={submit} />}
    {props.additionalCommands?.map((spec) => <CommandForm key={spec.command} title={spec.title} spec={spec} values={values} setValues={setValues} busy={busy} disabled={!company || !organization} onSubmit={submit} />)}
    <section className="overflow-hidden rounded-2xl border border-default-200 bg-content1">
      <div className="flex items-center justify-between border-b border-default-200 px-4 py-3"><h2 className="font-semibold">{props.title}</h2><BaseButton.Root size="sm" variant="secondary" onPress={() => void load()} loading={busy}>Actualizar</BaseButton.Root></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="bg-default-50">{props.columns.map((column) => <th key={column.key} className="px-4 py-3 font-medium">{column.label}</th>)}{props.rowActions?.length ? <th className="px-4 py-3 font-medium">Acciones</th> : null}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? index)} className="border-t border-default-100">{props.columns.map((column) => <td key={column.key} className="px-4 py-3">{displayValue(row[column.key])}</td>)}{props.rowActions?.length ? <td className="flex flex-wrap gap-2 px-4 py-3">{props.rowActions.map((action) => <BaseButton.Root key={action.label} size="sm" variant="secondary" disabled={busy} onPress={() => void runRowAction(action, row)}>{action.label}</BaseButton.Root>)}</td> : null}</tr>)}{!busy && rows.length === 0 && <tr><td colSpan={props.columns.length + (props.rowActions?.length ? 1 : 0)} className="px-4 py-8 text-center text-default-500">No hay registros para esta empresa.</td></tr>}</tbody></table></div>
    </section>
  </main>;
}

function CommandForm(props: {
  readonly title: string;
  readonly spec: AccountingAdditionalCommand;
  readonly values: Readonly<Record<string, string>>;
  readonly setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>, spec: AccountingAdditionalCommand) => Promise<void>;
}): React.JSX.Element {
  return <form onSubmit={(event) => void props.onSubmit(event, props.spec)} className="grid gap-3 rounded-2xl border border-default-200 bg-content1 p-4 sm:grid-cols-2 lg:grid-cols-4">
    <h2 className="font-semibold sm:col-span-2 lg:col-span-4">{props.title}</h2>
    {props.spec.fields.map((field) => field.values ? <label key={field.name} className="grid gap-1 text-sm">{field.label}<select required value={props.values[field.name] ?? ""} onChange={(event) => props.setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="rounded-lg border border-default-300 bg-content1 px-3 py-2"><option value="">Selecciona</option>{field.values.map((value) => <option key={value} value={value}>{value}</option>)}</select></label> : <label key={field.name} className="grid gap-1 text-sm">{field.label}<input required value={props.values[field.name] ?? ""} onChange={(event) => props.setValues((current) => ({ ...current, [field.name]: event.target.value }))} className="rounded-lg border border-default-300 bg-content1 px-3 py-2" /></label>)}
    <div className="flex items-end"><BaseButton.Root type="submit" loading={props.busy} disabled={props.disabled}>Guardar</BaseButton.Root></div>
  </form>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
