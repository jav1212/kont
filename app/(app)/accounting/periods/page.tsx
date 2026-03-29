"use client";

// Accounting periods management page.
// Allows creating open periods and closing them when done.
// Destructive actions (close period) use a HeroUI modal instead of window.confirm().
import { useId, useState }                from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { PageHeader }                     from '@/src/shared/frontend/components/page-header';
import { BaseButton }                     from '@/src/shared/frontend/components/base-button';
import { BaseTable }                      from '@/src/shared/frontend/components/base-table';
import { AccountingAccessGuard }          from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                     from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccountingPeriods }           from '@/src/modules/accounting/frontend/hooks/use-accounting-periods';
import type { AccountingPeriod }          from '@/src/modules/accounting/backend/domain/accounting-period';
import { APP_SIZES }                      from '@/src/shared/frontend/sizes';

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', startDate: '', endDate: '' };

function formatDate(iso: string) {
    return new Date(iso + 'T00:00:00').toLocaleDateString('es-VE');
}

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    "placeholder:text-neutral-400",
].join(" ");

const labelCls = `font-mono ${APP_SIZES.text.label} uppercase text-neutral-500 dark:text-neutral-400 block mb-1.5`;

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'open' | 'closed' }) {
    if (status === 'open') {
        return (
            <span
                aria-label="Período abierto"
                className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border font-mono text-[11px] tracking-wide"
                style={{
                    background: 'var(--badge-success-bg)',
                    borderColor: 'var(--badge-success-border)',
                    color: 'var(--text-success)',
                }}
            >
                Abierto
            </span>
        );
    }
    return (
        <span
            aria-label="Período cerrado"
            className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border font-mono text-[11px] tracking-wide bg-surface-2 border-border-light text-neutral-500"
        >
            Cerrado
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PeriodRow extends AccountingPeriod {
    startFormatted: string;
    endFormatted:   string;
}

export default function PeriodsPage() {
    const formId = useId();
    const { companyId }                    = useCompany();
    const { data, loading, error, reload } = useAccountingPeriods(companyId);
    const [form,    setForm]               = useState(EMPTY_FORM);
    const [saving,  setSaving]             = useState(false);
    const [formErr, setFormErr]            = useState<string | null>(null);
    const [closeTarget, setCloseTarget]    = useState<AccountingPeriod | null>(null);
    const [closing, setClosing]            = useState(false);
    const [closeErr, setCloseErr]          = useState<string | null>(null);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!companyId) return;
        setSaving(true);
        setFormErr(null);
        try {
            const res  = await fetch('/api/accounting/periods', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ companyId, ...form }),
            });
            const json = await res.json() as { error?: string };
            if (!res.ok) { setFormErr(json.error ?? 'No se pudo crear el período. Inténtalo de nuevo.'); return; }
            setForm(EMPTY_FORM);
            await reload();
        } catch {
            setFormErr('No se pudo crear el período. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    async function confirmClose() {
        if (!closeTarget) return;
        setClosing(true);
        setCloseErr(null);
        try {
            const res = await fetch(`/api/accounting/periods/${closeTarget.id}/close`, { method: 'POST' });
            if (!res.ok) {
                const json = await res.json() as { error?: string };
                setCloseErr(json.error ?? 'No se pudo cerrar el período.');
                return;
            }
            setCloseTarget(null);
            await reload();
        } catch {
            setCloseErr('No se pudo cerrar el período.');
        } finally {
            setClosing(false);
        }
    }

    const rows: PeriodRow[] = data.map((p) => ({
        ...p,
        startFormatted: formatDate(p.startDate),
        endFormatted:   formatDate(p.endDate),
    }));

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                <PageHeader title="Períodos Contables" />

                <div className="flex flex-col gap-6 p-8 max-w-3xl">

                    {/* ── New period form ────────────────────────────── */}
                    <section
                        aria-label="Crear nuevo período contable"
                        className="flex flex-col gap-4 p-5 border border-border-light rounded-xl bg-surface-1"
                    >
                        <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] text-neutral-500">
                            Nuevo período
                        </h2>

                        <form id={formId} onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {/* Name */}
                                <div className="flex flex-col">
                                    <label htmlFor={`${formId}-name`} className={labelCls}>
                                        Nombre
                                    </label>
                                    <input
                                        id={`${formId}-name`}
                                        required
                                        placeholder="Ej. Enero 2026"
                                        value={form.name}
                                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                        className={fieldCls}
                                    />
                                </div>

                                {/* Start date */}
                                <div className="flex flex-col">
                                    <label htmlFor={`${formId}-start`} className={labelCls}>
                                        Fecha inicio
                                    </label>
                                    <input
                                        id={`${formId}-start`}
                                        required
                                        type="date"
                                        value={form.startDate}
                                        onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                                        className={fieldCls}
                                    />
                                </div>

                                {/* End date */}
                                <div className="flex flex-col">
                                    <label htmlFor={`${formId}-end`} className={labelCls}>
                                        Fecha fin
                                    </label>
                                    <input
                                        id={`${formId}-end`}
                                        required
                                        type="date"
                                        value={form.endDate}
                                        onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                                        className={fieldCls}
                                    />
                                </div>
                            </div>

                            {formErr && (
                                <p role="alert" className="font-mono text-[12px] text-[var(--text-error)]">
                                    {formErr}
                                </p>
                            )}

                            <BaseButton.Root
                                type="submit"
                                variant="primary"
                                size="sm"
                                loading={saving}
                                className="self-start"
                            >
                                Crear período
                            </BaseButton.Root>
                        </form>
                    </section>

                    {/* ── Periods table ──────────────────────────────── */}
                    <BaseTable.Render<PeriodRow>
                        columns={[
                            { key: 'name', label: 'Nombre' },
                            { key: 'startFormatted', label: 'Inicio' },
                            { key: 'endFormatted',   label: 'Fin' },
                            {
                                key: 'status',
                                label: 'Estado',
                                render: (v) => <StatusBadge status={v as 'open' | 'closed'} />,
                            },
                            {
                                key: 'id',
                                label: '',
                                align: 'end',
                                render: (_v, item) => item.status === 'open' ? (
                                    <button
                                        type="button"
                                        onClick={() => { setCloseTarget(item); setCloseErr(null); }}
                                        className="font-mono text-[12px] text-neutral-500 hover:text-foreground focus-visible:outline-none focus-visible:underline transition-colors"
                                    >
                                        Cerrar período
                                    </button>
                                ) : null,
                            },
                        ]}
                        data={rows}
                        keyExtractor={(item) => item.id}
                        isLoading={loading}
                        emptyContent={
                            <div className="flex flex-col items-center gap-2">
                                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-400">
                                    Sin períodos registrados
                                </span>
                                <span className="font-mono text-[11px] text-neutral-400">
                                    Crea tu primer período usando el formulario de arriba.
                                </span>
                            </div>
                        }
                    />

                    {error && (
                        <p role="alert" className="font-mono text-[12px] text-[var(--text-error)]">
                            {error}
                        </p>
                    )}
                </div>
            </div>

            {/* ── Close period confirmation modal ────────────────────── */}
            <Modal
                isOpen={closeTarget !== null}
                onClose={() => { setCloseTarget(null); setCloseErr(null); }}
                size="sm"
            >
                <ModalContent>
                    <ModalHeader className="font-mono text-[13px] uppercase tracking-[0.1em]">
                        Cerrar período contable
                    </ModalHeader>
                    <ModalBody>
                        <p className="font-mono text-[13px] text-neutral-600 dark:text-neutral-400">
                            ¿Cerrar el período{' '}
                            <span className="font-semibold text-foreground">&ldquo;{closeTarget?.name}&rdquo;</span>
                            ? No podrás registrar nuevos asientos en este período una vez cerrado.
                        </p>
                        {closeErr && (
                            <p role="alert" className="font-mono text-[12px] text-[var(--text-error)] mt-2">
                                {closeErr}
                            </p>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <BaseButton.Root
                            variant="ghost"
                            size="sm"
                            onPress={() => { setCloseTarget(null); setCloseErr(null); }}
                            isDisabled={closing}
                        >
                            Cancelar
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="danger"
                            size="sm"
                            loading={closing}
                            onPress={() => { void confirmClose(); }}
                        >
                            Cerrar período
                        </BaseButton.Root>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </AccountingAccessGuard>
    );
}
