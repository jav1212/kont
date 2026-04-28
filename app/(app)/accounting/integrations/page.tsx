"use client";

// Accounting integrations page.
// Configures per-company rules that map operational events (Payroll, Inventory)
// to accounting entries (debit account, credit account, amount field).
// Also shows the integration execution log for traceability.
// Destructive actions use HeroUI modals instead of window.confirm().
import { useId, useState }              from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { PageHeader }                   from '@/src/shared/frontend/components/page-header';
import { BaseButton }                   from '@/src/shared/frontend/components/base-button';
import { BaseInput }                    from '@/src/shared/frontend/components/base-input';
import { BaseTable }                    from '@/src/shared/frontend/components/base-table';
import { AccountingAccessGuard }        from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                   from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccounts }                  from '@/src/modules/accounting/frontend/hooks/use-accounts';
import { useIntegrationRules }          from '@/src/modules/accounting/frontend/hooks/use-integration-rules';
import { useIntegrationLog }            from '@/src/modules/accounting/frontend/hooks/use-integration-log';
import { notify }                       from '@/src/shared/frontend/notify';
import type { IntegrationRule, IntegrationSource, AmountField } from '@/src/modules/accounting/backend/domain/integration-rule';
import { APP_SIZES }                    from '@/src/shared/frontend/sizes';

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<IntegrationSource, string> = {
    payroll:              'Nómina',
    inventory_purchase:   'Compras de inventario',
    inventory_movement:   'Movimientos de inventario',
};

const AMOUNT_OPTIONS: Record<IntegrationSource, { value: AmountField; label: string }[]> = {
    payroll: [
        { value: 'total_earnings',   label: 'Total devengado' },
        { value: 'total_deductions', label: 'Total deducciones' },
        { value: 'net_pay',          label: 'Pago neto' },
    ],
    inventory_purchase: [
        { value: 'subtotal',   label: 'Subtotal' },
        { value: 'vat_amount', label: 'IVA' },
        { value: 'total',      label: 'Total' },
    ],
    inventory_movement: [
        { value: 'total_cost', label: 'Costo total' },
    ],
};

const INTEGRATION_SOURCES = Object.keys(SOURCE_LABELS) as IntegrationSource[];

const EMPTY_FORM = {
    source:          'payroll' as IntegrationSource,
    debitAccountId:  '',
    creditAccountId: '',
    amountField:     'total_earnings' as AmountField,
    description:     '',
};

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    "placeholder:text-neutral-400",
].join(" ");

const labelCls = `font-mono ${APP_SIZES.text.label} uppercase text-neutral-500 dark:text-neutral-400 block mb-1.5`;

// ── Status badge ───────────────────────────────────────────────────────────────

function LogStatusBadge({ status }: { status: string }) {
    if (status === 'success') {
        return (
            <span
                aria-label="Exitoso"
                className="inline-flex items-center h-[22px] px-2 rounded-md border font-mono text-[11px] tracking-wide"
                style={{
                    background:  'var(--badge-success-bg)',
                    borderColor: 'var(--badge-success-border)',
                    color:       'var(--text-success)',
                }}
            >
                Exitoso
            </span>
        );
    }
    if (status === 'error') {
        return (
            <span
                aria-label="Error"
                className="inline-flex items-center h-[22px] px-2 rounded-md border font-mono text-[11px] tracking-wide"
                style={{
                    background:  'var(--badge-error-bg)',
                    borderColor: 'var(--badge-error-border)',
                    color:       'var(--text-error)',
                }}
            >
                Error
            </span>
        );
    }
    return (
        <span
            aria-label="Omitido"
            className="inline-flex items-center h-[22px] px-2 rounded-md border font-mono text-[11px] tracking-wide bg-surface-2 border-border-light text-neutral-500"
        >
            Omitido
        </span>
    );
}

// ── Row types ─────────────────────────────────────────────────────────────────

interface RuleRow extends IntegrationRule {
    sourceLabel:  string;
    amountLabel:  string;
    debitCode:    string;
    creditCode:   string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
    const formId = useId();
    const { companyId }    = useCompany();
    const { data: accounts }                                     = useAccounts(companyId);
    const { data: rules, loading: rulesLoading, reload: reloadRules } = useIntegrationRules(companyId);
    const { data: log,   loading: logLoading,   reload: reloadLog }   = useIntegrationLog(companyId, 50);

    const [form,         setForm]         = useState(EMPTY_FORM);
    const [editing,      setEditing]      = useState<string | null>(null);
    const [saving,       setSaving]       = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<IntegrationRule | null>(null);
    const [deleting,     setDeleting]     = useState(false);
    const [tab,          setTab]          = useState<'rules' | 'log'>('rules');

    function startEdit(rule: IntegrationRule) {
        setEditing(rule.id);
        setForm({
            source:          rule.source,
            debitAccountId:  rule.debitAccountId,
            creditAccountId: rule.creditAccountId,
            amountField:     rule.amountField,
            description:     rule.description,
        });
        document.getElementById(formId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cancelEdit() {
        setEditing(null);
        setForm(EMPTY_FORM);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!companyId) return;
        setSaving(true);
        try {
            const body = {
                ...(editing ? { id: editing } : {}),
                companyId,
                ...form,
                isActive: true,
            };
            const res  = await fetch('/api/accounting/integration-rules', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const json = await res.json() as { error?: string };
            if (!res.ok) { notify.error(json.error ?? 'No se pudo guardar la regla. Inténtalo de nuevo.'); return; }
            cancelEdit();
            await reloadRules();
        } catch {
            notify.error('No se pudo guardar la regla. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/accounting/integration-rules/${deleteTarget.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const json = await res.json() as { error?: string };
                notify.error(json.error ?? 'No se pudo eliminar la regla.');
                return;
            }
            setDeleteTarget(null);
            await reloadRules();
        } catch {
            notify.error('No se pudo eliminar la regla.');
        } finally {
            setDeleting(false);
        }
    }

    const amountOptions = AMOUNT_OPTIONS[form.source] ?? [];

    const ruleRows: RuleRow[] = rules.map((rule) => {
        const debitAcc  = accounts.find((a) => a.id === rule.debitAccountId);
        const creditAcc = accounts.find((a) => a.id === rule.creditAccountId);
        return {
            ...rule,
            sourceLabel: SOURCE_LABELS[rule.source],
            amountLabel: AMOUNT_OPTIONS[rule.source]?.find((o) => o.value === rule.amountField)?.label ?? rule.amountField,
            debitCode:   debitAcc  ? debitAcc.code  : rule.debitAccountId.slice(0, 8),
            creditCode:  creditAcc ? creditAcc.code : rule.creditAccountId.slice(0, 8),
        };
    });

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                <PageHeader title="Integraciones Contables" />

                <div className="flex flex-col gap-6 p-8 max-w-5xl">

                    <p className="font-mono text-[13px] text-neutral-500 max-w-xl">
                        Define qué cuentas debitar y acreditar automáticamente cuando se confirma una
                        nómina o una factura de compra. Las entradas se crean y publican sin intervención manual.
                    </p>

                    {/* ── Rule form ──────────────────────────────────── */}
                    <section
                        id={formId}
                        aria-label={editing ? 'Editar regla de integración' : 'Nueva regla de integración'}
                        className="flex flex-col gap-4 p-5 border border-border-light rounded-xl bg-surface-1"
                    >
                        <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] text-neutral-500">
                            {editing ? 'Editar regla' : 'Nueva regla'}
                        </h2>

                        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                                {/* Source */}
                                <div className="flex flex-col">
                                    <label htmlFor={`${formId}-source`} className={labelCls}>
                                        Módulo origen
                                    </label>
                                    <select
                                        id={`${formId}-source`}
                                        value={form.source}
                                        onChange={(e) => {
                                            const src = e.target.value as IntegrationSource;
                                            const firstAmt = AMOUNT_OPTIONS[src]?.[0]?.value ?? 'total';
                                            setForm((f) => ({ ...f, source: src, amountField: firstAmt }));
                                        }}
                                        className={fieldCls}
                                    >
                                        {INTEGRATION_SOURCES.map((k) => (
                                            <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Amount field */}
                                <div className="flex flex-col">
                                    <label htmlFor={`${formId}-amount`} className={labelCls}>
                                        Monto a usar
                                    </label>
                                    <select
                                        id={`${formId}-amount`}
                                        value={form.amountField}
                                        onChange={(e) => setForm((f) => ({ ...f, amountField: e.target.value as AmountField }))}
                                        className={fieldCls}
                                    >
                                        {amountOptions.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Debit account */}
                                <div className="flex flex-col">
                                    <label htmlFor={`${formId}-debit`} className={labelCls}>
                                        Cuenta débito
                                    </label>
                                    <select
                                        id={`${formId}-debit`}
                                        required
                                        value={form.debitAccountId}
                                        onChange={(e) => setForm((f) => ({ ...f, debitAccountId: e.target.value }))}
                                        className={fieldCls}
                                    >
                                        <option value="">— Seleccionar —</option>
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Credit account */}
                                <div className="flex flex-col">
                                    <label htmlFor={`${formId}-credit`} className={labelCls}>
                                        Cuenta crédito
                                    </label>
                                    <select
                                        id={`${formId}-credit`}
                                        required
                                        value={form.creditAccountId}
                                        onChange={(e) => setForm((f) => ({ ...f, creditAccountId: e.target.value }))}
                                        className={fieldCls}
                                    >
                                        <option value="">— Seleccionar —</option>
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Description */}
                                <BaseInput.Field
                                    className="sm:col-span-2"
                                    label="Descripción del asiento (usa {{period}} o {{ref}})"
                                    isRequired
                                    placeholder="Ej. Nómina {{period}}"
                                    value={form.description}
                                    onValueChange={(v) => setForm((f) => ({ ...f, description: v }))}
                                />
                            </div>


                            <div className="flex gap-2">
                                <BaseButton.Root
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    loading={saving}
                                >
                                    {editing ? 'Actualizar regla' : 'Agregar regla'}
                                </BaseButton.Root>
                                {editing && (
                                    <BaseButton.Root
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onPress={cancelEdit}
                                    >
                                        Cancelar
                                    </BaseButton.Root>
                                )}
                            </div>
                        </form>
                    </section>

                    {/* ── Tabs ───────────────────────────────────────── */}
                    <div className="flex gap-1 border-b border-border-light" role="tablist">
                        {(['rules', 'log'] as const).map((t) => (
                            <button
                                key={t}
                                role="tab"
                                aria-selected={tab === t}
                                onClick={() => setTab(t)}
                                className={[
                                    "font-mono text-[12px] uppercase tracking-[0.1em] px-4 py-2 -mb-px border-b-2 transition-colors focus-visible:outline-none",
                                    tab === t
                                        ? "border-primary-500 text-primary-600 dark:text-primary-400"
                                        : "border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300",
                                ].join(" ")}
                            >
                                {t === 'rules' ? 'Reglas configuradas' : 'Registro de ejecuciones'}
                            </button>
                        ))}
                    </div>

                    {/* ── Rules tab ──────────────────────────────────── */}
                    {tab === 'rules' && (
                        <BaseTable.Render<RuleRow>
                            columns={[
                                { key: 'sourceLabel', label: 'Módulo' },
                                { key: 'amountLabel', label: 'Monto' },
                                {
                                    key: 'debitCode',
                                    label: 'Débito',
                                    render: (v) => (
                                        <span className="font-mono text-[13px] tabular-nums text-neutral-500">{String(v)}</span>
                                    ),
                                },
                                {
                                    key: 'creditCode',
                                    label: 'Crédito',
                                    render: (v) => (
                                        <span className="font-mono text-[13px] tabular-nums text-neutral-500">{String(v)}</span>
                                    ),
                                },
                                { key: 'description', label: 'Descripción' },
                                {
                                    key: 'id',
                                    label: '',
                                    align: 'end',
                                    render: (_v, item) => (
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                type="button"
                                                onClick={() => startEdit(item)}
                                                className="font-mono text-[12px] text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:underline transition-colors"
                                            >
                                                Editar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setDeleteTarget(item); }}
                                                className="font-mono text-[12px] text-[var(--text-error)] hover:opacity-70 focus-visible:outline-none focus-visible:underline transition-opacity"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    ),
                                },
                            ]}
                            data={ruleRows}
                            keyExtractor={(item) => item.id}
                            isLoading={rulesLoading}
                            emptyContent={
                                <div className="flex flex-col items-center gap-2">
                                    <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-400">
                                        Sin reglas configuradas
                                    </span>
                                    <span className="font-mono text-[11px] text-neutral-400">
                                        Agrega tu primera regla usando el formulario de arriba.
                                    </span>
                                </div>
                            }
                        />
                    )}

                    {/* ── Log tab ────────────────────────────────────── */}
                    {tab === 'log' && (
                        <div className="flex flex-col gap-4">
                            <div className="flex justify-end">
                                <BaseButton.Root
                                    variant="ghost"
                                    size="sm"
                                    onPress={() => { void reloadLog(); }}
                                >
                                    Actualizar
                                </BaseButton.Root>
                            </div>

                            <BaseTable.Render<typeof log[number]>
                                columns={[
                                    {
                                        key: 'createdAt',
                                        label: 'Fecha',
                                        render: (v) => (
                                            <span className="font-mono text-[13px] tabular-nums text-neutral-500">
                                                {new Date(String(v)).toLocaleString('es-VE')}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'source',
                                        label: 'Módulo',
                                        render: (v) => (
                                            <span className="font-mono text-[13px]">
                                                {SOURCE_LABELS[v as IntegrationSource] ?? String(v)}
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'sourceRef',
                                        label: 'Referencia',
                                        render: (v) => (
                                            <span className="font-mono text-[12px] tabular-nums text-neutral-400">
                                                {String(v).slice(0, 8)}…
                                            </span>
                                        ),
                                    },
                                    {
                                        key: 'status',
                                        label: 'Estado',
                                        render: (v) => <LogStatusBadge status={String(v)} />,
                                    },
                                    {
                                        key: 'errorMessage',
                                        label: 'Detalle',
                                        render: (v, item) => (
                                            <span className="font-mono text-[12px] text-neutral-400">
                                                {v
                                                    ? String(v)
                                                    : (item.entryId
                                                        ? `Asiento: ${String(item.entryId).slice(0, 8)}…`
                                                        : '—')
                                                }
                                            </span>
                                        ),
                                    },
                                ]}
                                data={log}
                                keyExtractor={(item) => item.id}
                                isLoading={logLoading}
                                emptyContent={
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-400">
                                            Sin ejecuciones registradas
                                        </span>
                                        <span className="font-mono text-[11px] text-neutral-400">
                                            Las ejecuciones aparecen aquí cuando se confirma una nómina o compra.
                                        </span>
                                    </div>
                                }
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* ── Delete confirmation modal ──────────────────────────── */}
            <Modal
                isOpen={deleteTarget !== null}
                onClose={() => { setDeleteTarget(null); }}
                size="sm"
            >
                <ModalContent>
                    <ModalHeader className="font-mono text-[13px] uppercase tracking-[0.1em]">
                        Eliminar regla de integración
                    </ModalHeader>
                    <ModalBody>
                        <p className="font-mono text-[13px] text-neutral-600 dark:text-neutral-400">
                            ¿Eliminar la regla para{' '}
                            <span className="font-semibold text-foreground">
                                {deleteTarget ? SOURCE_LABELS[deleteTarget.source] : ''}
                            </span>
                            ? Los asientos ya generados no se verán afectados.
                        </p>
                    </ModalBody>
                    <ModalFooter>
                        <BaseButton.Root
                            variant="ghost"
                            size="sm"
                            onPress={() => { setDeleteTarget(null); }}
                            isDisabled={deleting}
                        >
                            Cancelar
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="danger"
                            size="sm"
                            loading={deleting}
                            onPress={() => { void confirmDelete(); }}
                        >
                            Eliminar regla
                        </BaseButton.Root>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </AccountingAccessGuard>
    );
}
