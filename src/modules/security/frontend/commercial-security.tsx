"use client";
import { useEffect, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { notify } from "@/src/shared/frontend/notify";

import { useOrganization } from "@/src/modules/organizations/frontend/context/organization-context";
import { useOrganizationModuleAccess } from "@/src/modules/organizations/frontend/use-organization-module-access";

type Customer = { id: string; nombre?: string; name?: string };
type Limit = { limitVes: string; version: number } | null;
type Receivable = { id: string; customer_id: string };
type Payment = {
  id: string;
  receivable_id: string;
  received_amount: string | number;
  received_currency_code: string;
  occurred_at: string;
  reversed?: boolean;
};

/** Configures customer credit ceilings and appends immutable receivable-payment reversals. */
function CommercialSecurityPanel() {
  const { companyId } = useCompany();
  const { can } = useOrganizationModuleAccess("/settings/security-sales");
  const intents = useRef(new Map<string, string>());
  const [limitReady, setLimitReady] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [limit, setLimit] = useState<Limit>(null);
  const [amount, setAmount] = useState("0");
  const [accounts, setAccounts] = useState<Receivable[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!companyId) return;
    let current = true;
    void (async () => {
      try {
        const [customersResponse, receivablesResponse] = await Promise.all([
          apiFetch(
            `/api/sales/customers?companyId=${encodeURIComponent(companyId)}`,
          ),
          apiFetch(
            `/api/sales/receivables?companyId=${encodeURIComponent(companyId)}`,
          ),
        ]);
        const customersBody = await customersResponse.json();
        const receivablesBody = await receivablesResponse.json();
        if (!customersResponse.ok || !receivablesResponse.ok)
          throw new Error(
            customersBody.error ??
              receivablesBody.error ??
              "No se pudieron cargar los datos comerciales.",
          );
        if (current) {
          setCustomers(customersBody.data ?? []);
          setAccounts(receivablesBody.data?.accounts ?? []);
          setPayments(receivablesBody.data?.payments ?? []);
        }
      } catch (error) {
        if (current)
          notify.error(
            error instanceof Error
              ? error.message
              : "No se pudieron cargar los datos.",
          );
      }
    })();
    return () => {
      current = false;
    };
  }, [companyId]);
  useEffect(() => {
    if (!companyId || !customerId) return;
    let current = true;
    void (async () => {
      try {
        const response = await apiFetch(
          `/api/sales/customers/${encodeURIComponent(customerId)}/credit-limit?companyId=${encodeURIComponent(companyId)}`,
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "No se pudo consultar el límite.");
        if (current) {
          setLimit(body.data);
          setAmount(body.data?.limitVes ?? "0");
          setLimitReady(true);
        }
      } catch (error) {
        if (current)
          notify.error(
            error instanceof Error
              ? error.message
              : "No se pudo consultar el límite.",
          );
      }
    })();
    return () => {
      current = false;
    };
  }, [companyId, customerId]);
  const save = async () => {
    if (!companyId || !customerId || !limitReady) return;
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/sales/customers/${encodeURIComponent(customerId)}/credit-limit`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId,
            limitVes: amount,
            expectedVersion: limit?.version ?? 0,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setLimit(body.data);
      notify.success("Límite de crédito guardado.");
    } catch (error) {
      notify.error(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el límite.",
      );
    } finally {
      setBusy(false);
    }
  };
  const reverse = async (payment: Payment) => {
    const receivable = accounts.find(
      (entry) => entry.id === payment.receivable_id,
    );
    if (!companyId || !receivable || !reason.trim()) return;
    if (payment.reversed || busy) return;
    if (!intents.current.has(payment.id))
      intents.current.set(payment.id, crypto.randomUUID());
    setBusy(true);
    try {
      const response = await apiFetch(
        `/api/sales/receivables/${encodeURIComponent(receivable.id)}/payments/${encodeURIComponent(payment.id)}/reverse`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            companyId,
            idempotencyKey: intents.current.get(payment.id),
            reason,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      notify.success(
        body.data.replayed ? "Reversión ya registrada." : "Pago revertido.",
      );
      setPayments((entries) =>
        entries.map((entry) =>
          entry.id === payment.id ? { ...entry, reversed: true } : entry,
        ),
      );
      setReason("");
    } catch (error) {
      notify.error(
        error instanceof Error ? error.message : "No se pudo revertir el pago.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      <section className="rounded-xl border border-border-light bg-surface-1 p-5">
        <h1 className="text-lg font-semibold">Crédito de clientes</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          El límite se guarda en bolívares y se valida al confirmar ventas a
          crédito.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <select
            value={customerId}
            aria-label="Cliente"
            disabled={busy}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setLimitReady(false);
              setLimit(null);
              setAmount("0");
            }}
            className="h-10 rounded border border-border-light bg-surface-1 px-3"
          >
            <option value="">Selecciona un cliente</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.nombre ?? customer.name ?? customer.id}
              </option>
            ))}
          </select>
          <input
            aria-label="Límite de crédito en bolívares"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            className="h-10 rounded border border-border-light bg-surface-1 px-3"
            placeholder="Límite VES"
          />
          <button
            disabled={
              busy || !customerId || !limitReady || !can("sales.update")
            }
            onClick={save}
            className="rounded bg-primary-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            Guardar límite
          </button>
        </div>
      </section>
      <section className="rounded-xl border border-border-light bg-surface-1 p-5">
        <h2 className="text-lg font-semibold">Revertir abono</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          La reversión conserva el abono original y requiere un motivo.
        </p>
        <input
          aria-label="Motivo de reversión"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className="mt-4 h-10 w-full rounded border border-border-light bg-surface-1 px-3"
          placeholder="Motivo de la reversión"
        />
        {payments.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            No hay abonos registrados.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between rounded border border-border-light p-3 text-sm"
              >
                <span>
                  {customers.find((customer) => customer.id === accounts.find((account) => account.id === payment.receivable_id)?.customer_id)?.name ?? "Abono"}
                  {" · "}{String(payment.received_amount)} {payment.received_currency_code}
                  {" · "}{new Date(payment.occurred_at).toLocaleDateString("es-VE")}
                </span>
                <button
                  disabled={
                    busy ||
                    !reason.trim() ||
                    payment.reversed ||
                    !can("sales.receivable_payments.reverse")
                  }
                  onClick={() => reverse(payment)}
                  className="rounded border border-red-300 px-3 py-1 text-red-600 disabled:opacity-50"
                >
                  {payment.reversed ? "Revertido" : "Revertir"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Renders commercial controls isolated from previous organization/company selections.
 * @returns An authorized panel or a scope-selection message.
 * @throws Never; persistence failures appear as notifications.
 */
export function CommercialSecurity(): React.JSX.Element {
  const { companyId } = useCompany();
  const { organization } = useOrganization();
  const { state } = useOrganizationModuleAccess("/settings/security-sales");
  if (state !== "allowed")
    return <p className="p-5">Sin acceso a los controles comerciales.</p>;
  if (!companyId) return <p className="p-5">Selecciona una empresa.</p>;
  return <CommercialSecurityPanel key={`${organization?.id}:${companyId}`} />;
}
