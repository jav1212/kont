"use client";

// Accounting periods management page.
// Allows creating open periods and closing them when done.
// Destructive actions (close period) use a HeroUI modal instead of window.confirm().

import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import {
    CalendarRange,
    CalendarPlus,
    Lock,
    CircleDot,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react';

import { PageHeader }                     from '@/src/shared/frontend/components/page-header';
import { BaseButton }                     from '@/src/shared/frontend/components/base-button';
import { BaseInput }                      from '@/src/shared/frontend/components/base-input';
import { BaseTable }                      from '@/src/shared/frontend/components/base-table';
import { DashboardKpiCard }               from '@/src/shared/frontend/components/dashboard-kpi-card';
import { AccountingAccessGuard }          from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                     from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccountingPeriods }           from '@/src/modules/accounting/frontend/hooks/use-accounting-periods';
import { notify }                         from '@/src/shared/frontend/notify';
import type { AccountingPeriod }          from '@/src/modules/accounting/backend/domain/accounting-period';

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', startDate: '', endDate: '' };

const MONTHS_SHORT = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

function fmtRange(startIso: string, endIso: string): string {
    const [sy, sm, sd] = startIso.split('T')[0].split('-');
    const [ey, em, ed] = endIso.split('T')[0].split('-');
    const sMonth = MONTHS_SHORT[(Number(sm) - 1) | 0] ?? '';
    const eMonth = MONTHS_SHORT[(Number(em) - 1) | 0] ?? '';
    if (sy === ey) {
        return `${parseInt(sd, 10)} ${sMonth} – ${parseInt(ed, 10)} ${eMonth} ${ey}`;
    }
    return `${parseInt(sd, 10)} ${sMonth} ${sy} – ${parseInt(ed, 10)} ${eMonth} ${ey}`;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function daysBetween(aIso: string, bIso: string): number {
    const a = new Date(aIso + 'T00:00:00').getTime();
    const b = new Date(bIso + 'T00:00:00').getTime();
    return Math.round((b - a) / 86_400_000);
}

type DerivedStatus = 'active' | 'open' | 'closed';

function deriveStatus(p: AccountingPeriod, today: string): DerivedStatus {
    if (p.status === 'closed') return 'closed';
    if (today >= p.startDate && today <= p.endDate) return 'active';
    return 'open';
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DerivedStatus }) {
    if (status === 'active') {
        return (
            <span
                aria-label="Período activo"
                className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border font-mono text-[11px] uppercase tracking-[0.08em] font-medium badge-success"
            >
                <CircleDot size={11} strokeWidth={2.5} className="animate-pulse" />
                Activo
            </span>
        );
    }
    if (status === 'open') {
        return (
            <span
                aria-label="Período abierto"
                className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border font-mono text-[11px] uppercase tracking-[0.08em] font-medium badge-info"
            >
                <CheckCircle2 size={11} strokeWidth={2.2} />
                Abierto
            </span>
        );
    }
    return (
        <span
            aria-label="Período cerrado"
            className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border font-mono text-[11px] uppercase tracking-[0.08em] font-medium bg-surface-2 border-border-light text-[var(--text-tertiary)]"
        >
            <Lock size={11} strokeWidth={2.2} />
            Cerrado
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PeriodRow extends AccountingPeriod {
    rangeFormatted: string;
    derived:        DerivedStatus;
    daysHint:       string | null;
}

export default function PeriodsPage() {
    const formId = useId();
    const { companyId }                    = useCompany();
    const { data, loading, reload }        = useAccountingPeriods(companyId);
    const [form,    setForm]               = useState(EMPTY_FORM);
    const [saving,  setSaving]             = useState(false);
    const [closeTarget, setCloseTarget]    = useState<AccountingPeriod | null>(null);
    const [closing, setClosing]            = useState(false);

    const today = todayIso();

    // ── Derived metrics ───────────────────────────────────────────────────────
    const metrics = useMemo(() => {
        let open = 0, closed = 0;
        let active: AccountingPeriod | null = null;
        for (const p of data) {
            if (p.status === 'closed') { closed++; continue; }
            open++;
            if (today >= p.startDate && today <= p.endDate) active = p;
        }
        return { open, closed, total: data.length, active };
    }, [data, today]);

    // ── Submit ────────────────────────────────────────────────────────────────
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!companyId) return;
        if (form.startDate && form.endDate && form.startDate > form.endDate) {
            notify.error('La fecha de inicio no puede ser posterior a la fecha de fin.');
            return;
        }
        setSaving(true);
        try {
            const res  = await fetch('/api/accounting/periods', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ companyId, ...form }),
            });
            const json = await res.json() as { error?: string };
            if (!res.ok) { notify.error(json.error ?? 'No se pudo crear el período. Inténtalo de nuevo.'); return; }
            setForm(EMPTY_FORM);
            notify.success('Período creado.');
            await reload();
        } catch {
            notify.error('No se pudo crear el período. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    async function confirmClose() {
        if (!closeTarget) return;
        setClosing(true);
        try {
            const res = await fetch(`/api/accounting/periods/${closeTarget.id}/close`, { method: 'POST' });
            if (!res.ok) {
                const json = await res.json() as { error?: string };
                notify.error(json.error ?? 'No se pudo cerrar el período.');
                return;
            }
            setCloseTarget(null);
            notify.success('Período cerrado.');
            await reload();
        } catch {
            notify.error('No se pudo cerrar el período.');
        } finally {
            setClosing(false);
        }
    }

    // ── Rows: sort (active first, then open desc, then closed desc) ──────────
    const rows: PeriodRow[] = useMemo(() => {
        const enriched: PeriodRow[] = data.map((p) => {
            const derived = deriveStatus(p, today);
            let daysHint: string | null = null;
            if (derived === 'active') {
                const remaining = daysBetween(today, p.endDate);
                daysHint = remaining <= 0
                    ? 'Vence hoy'
                    : `${remaining} día${remaining === 1 ? '' : 's'} restante${remaining === 1 ? '' : 's'}`;
            } else if (derived === 'open' && today < p.startDate) {
                const until = daysBetween(today, p.startDate);
                daysHint = `Inicia en ${until} día${until === 1 ? '' : 's'}`;
            } else if (derived === 'open' && today > p.endDate) {
                daysHint = 'Vencido — sin cerrar';
            }
            return {
                ...p,
                rangeFormatted: fmtRange(p.startDate, p.endDate),
                derived,
                daysHint,
            };
        });
        const order: Record<DerivedStatus, number> = { active: 0, open: 1, closed: 2 };
        return enriched.sort((a, b) => {
            const byStatus = order[a.derived] - order[b.derived];
            if (byStatus !== 0) return byStatus;
            return b.startDate.localeCompare(a.startDate);
        });
    }, [data, today]);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full bg-surface-2">
                <PageHeader
                    title="Períodos Contables"
                    subtitle={
                        metrics.total === 0
                            ? 'Sin períodos · crea el primero'
                            : `${metrics.total} ${metrics.total === 1 ? 'período' : 'períodos'} · ${metrics.open} abierto${metrics.open === 1 ? '' : 's'} · ${metrics.closed} cerrado${metrics.closed === 1 ? '' : 's'}`
                    }
                />

                <div className="flex flex-col gap-8 px-8 py-8 max-w-[1100px] mx-auto w-full">

                    {/* ── KPIs ──────────────────────────────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <DashboardKpiCard
                            label="Período activo"
                            value={metrics.active ? metrics.active.name : '—'}
                            sublabel={
                                metrics.active
                                    ? fmtRange(metrics.active.startDate, metrics.active.endDate)
                                    : metrics.open > 0
                                        ? `${metrics.open} abierto${metrics.open === 1 ? '' : 's'} · ninguno contiene hoy`
                                        : 'Sin período abierto'
                            }
                            color={metrics.active ? 'success' : metrics.total === 0 ? 'default' : 'warning'}
                            loading={loading}
                            icon={CalendarRange}
                        />
                        <DashboardKpiCard
                            label="Períodos abiertos"
                            value={metrics.open}
                            sublabel={metrics.open === 0 ? 'No hay períodos abiertos' : 'Permiten registrar asientos'}
                            color="primary"
                            loading={loading}
                            icon={CircleDot}
                        />
                        <DashboardKpiCard
                            label="Períodos cerrados"
                            value={metrics.closed}
                            sublabel={metrics.closed === 0 ? 'Aún ninguno cerrado' : 'Inmutables — sólo lectura'}
                            color="default"
                            loading={loading}
                            icon={Lock}
                        />
                    </div>

                    {/* ── New period form ───────────────────────────────── */}
                    <motion.section
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                        aria-label="Crear nuevo período contable"
                        className="flex flex-col gap-4 p-5 border border-border-light rounded-2xl bg-surface-1 shadow-sm"
                    >
                        <div className="flex items-center gap-3 pb-3 border-b border-border-light/60">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-500">
                                <CalendarPlus size={16} strokeWidth={2} />
                            </div>
                            <div className="flex flex-col">
                                <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] font-semibold text-foreground">
                                    Nuevo período
                                </h2>
                                <span className="font-sans text-[11px] text-[var(--text-tertiary)]">
                                    Define un rango contable para registrar asientos.
                                </span>
                            </div>
                        </div>

                        <form id={formId} onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <BaseInput.Field
                                    label="Nombre"
                                    isRequired
                                    placeholder="Ej. Enero 2026"
                                    value={form.name}
                                    onValueChange={(v) => setForm((f) => ({ ...f, name: v }))}
                                />

                                <BaseInput.Field
                                    label="Fecha inicio"
                                    isRequired
                                    type="date"
                                    value={form.startDate}
                                    onValueChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
                                />

                                <BaseInput.Field
                                    label="Fecha fin"
                                    isRequired
                                    type="date"
                                    value={form.endDate}
                                    onValueChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
                                />
                            </div>

                            <BaseButton.Root
                                type="submit"
                                variant="primary"
                                size="sm"
                                loading={saving}
                                leftIcon={<CalendarPlus size={14} strokeWidth={2.4} />}
                                className="self-start"
                            >
                                Crear período
                            </BaseButton.Root>
                        </form>
                    </motion.section>

                    {/* ── Periods table ─────────────────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35, ease: 'easeOut', delay: 0.05 }}
                    >
                        <BaseTable.Render<PeriodRow>
                            columns={[
                                {
                                    key: 'name',
                                    label: 'Nombre',
                                    render: (_v, item) => (
                                        <div className="flex flex-col">
                                            <span className="font-mono text-[13px] font-semibold text-foreground">
                                                {item.name}
                                            </span>
                                            {item.daysHint && (
                                                <span
                                                    className={[
                                                        'font-sans text-[11px] leading-tight',
                                                        item.derived === 'active'
                                                            ? 'text-text-success'
                                                            : item.derived === 'open' && item.daysHint.startsWith('Vencido')
                                                                ? 'text-text-warning'
                                                                : 'text-[var(--text-tertiary)]',
                                                    ].join(' ')}
                                                >
                                                    {item.daysHint}
                                                </span>
                                            )}
                                        </div>
                                    ),
                                },
                                {
                                    key: 'rangeFormatted',
                                    label: 'Rango',
                                    render: (v) => (
                                        <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
                                            {v as string}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'derived',
                                    label: 'Estado',
                                    render: (v) => <StatusBadge status={v as DerivedStatus} />,
                                },
                                {
                                    key: 'id',
                                    label: '',
                                    align: 'end',
                                    render: (_v, item) => item.status === 'open' ? (
                                        <BaseButton.Root
                                            variant="ghost"
                                            size="sm"
                                            leftIcon={<Lock size={13} strokeWidth={2} />}
                                            onPress={() => { setCloseTarget(item); }}
                                        >
                                            Cerrar
                                        </BaseButton.Root>
                                    ) : (
                                        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-disabled)]">
                                            —
                                        </span>
                                    ),
                                },
                            ]}
                            data={rows}
                            keyExtractor={(item) => item.id}
                            isLoading={loading}
                            emptyContent={
                                <div className="flex flex-col items-center gap-3 py-10">
                                    <div className="h-12 w-12 rounded-2xl bg-surface-2 flex items-center justify-center text-[var(--text-tertiary)] border border-border-light">
                                        <CalendarRange size={22} strokeWidth={1.8} />
                                    </div>
                                    <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                                        Sin períodos registrados
                                    </span>
                                    <span className="font-sans text-[12px] text-[var(--text-tertiary)] max-w-[320px] text-center">
                                        Crea el primer período usando el formulario de arriba para empezar a registrar asientos.
                                    </span>
                                </div>
                            }
                        />
                    </motion.div>

                </div>
            </div>

            {/* ── Close period confirmation modal ────────────────────── */}
            <Modal
                isOpen={closeTarget !== null}
                onClose={() => { setCloseTarget(null); }}
                size="sm"
            >
                <ModalContent>
                    <ModalHeader className="flex items-center gap-2 font-mono text-[13px] uppercase tracking-[0.1em]">
                        <AlertCircle size={16} className="text-[var(--text-warning)]" />
                        Cerrar período contable
                    </ModalHeader>
                    <ModalBody>
                        <p className="font-sans text-[13px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                            ¿Cerrar el período{' '}
                            <span className="font-mono font-semibold text-foreground">&ldquo;{closeTarget?.name}&rdquo;</span>
                            ? No podrás registrar nuevos asientos en este período una vez cerrado.
                        </p>
                        {closeTarget && (
                            <div className="mt-3 px-3 py-2 rounded-lg bg-surface-2 border border-border-light flex items-center gap-2">
                                <CalendarRange size={13} className="text-[var(--text-tertiary)] shrink-0" />
                                <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">
                                    {fmtRange(closeTarget.startDate, closeTarget.endDate)}
                                </span>
                            </div>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <BaseButton.Root
                            variant="ghost"
                            size="sm"
                            onPress={() => { setCloseTarget(null); }}
                            isDisabled={closing}
                        >
                            Cancelar
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="danger"
                            size="sm"
                            loading={closing}
                            leftIcon={<Lock size={13} strokeWidth={2.2} />}
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
