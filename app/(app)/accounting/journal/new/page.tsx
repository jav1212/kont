"use client";

// New journal entry form page.
// Builds a draft entry with dynamic debit/credit lines, then saves or posts it.
// Uses canonical HeroUI primitives and design tokens throughout.
import { useId, useState, useCallback } from 'react';
import { useContextRouter as useRouter } from '@/src/shared/frontend/hooks/use-url-context';
import { ContextLink as Link }          from '@/src/shared/frontend/components/context-link';
import { PageHeader }                   from '@/src/shared/frontend/components/page-header';
import { BaseButton }                   from '@/src/shared/frontend/components/base-button';
import { BaseInput }                    from '@/src/shared/frontend/components/base-input';
import { AccountingAccessGuard }        from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                   from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccounts }                  from '@/src/modules/accounting/frontend/hooks/use-accounts';
import { useAccountingPeriods }         from '@/src/modules/accounting/frontend/hooks/use-accounting-periods';
import { notify }                       from '@/src/shared/frontend/notify';
import type { SaveEntryInput }          from '@/src/modules/accounting/backend/domain/repository/journal-entry.repository';
import { APP_SIZES }                    from '@/src/shared/frontend/sizes';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineForm {
    accountId:   string;
    type:        'debit' | 'credit';
    amount:      string;
    description: string;
}

const EMPTY_LINE: LineForm = { accountId: '', type: 'debit', amount: '', description: '' };

function today() {
    return new Date().toISOString().slice(0, 10);
}

// ── Shared field styles ───────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    "placeholder:text-neutral-400",
].join(" ");

const labelCls = `font-mono ${APP_SIZES.text.label} uppercase text-neutral-500 dark:text-neutral-400 block mb-1.5`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewJournalEntryPage() {
    const formId                   = useId();
    const router                   = useRouter();
    const { companyId }            = useCompany();
    const { data: accounts }       = useAccounts(companyId);
    const { data: periods }        = useAccountingPeriods(companyId);
    const openPeriods              = periods.filter((p) => p.status === 'open');

    const [date,        setDate]        = useState(today());
    const [description, setDescription] = useState('');
    const [periodId,    setPeriodId]    = useState('');
    const [lines,       setLines]       = useState<LineForm[]>([
        { ...EMPTY_LINE, type: 'debit' },
        { ...EMPTY_LINE, type: 'credit' },
    ]);
    const [saving,  setSaving]  = useState(false);

    const addLine    = useCallback(() => setLines((ls) => [...ls, { ...EMPTY_LINE }]), []);
    const removeLine = useCallback((idx: number) =>
        setLines((ls) => ls.filter((_, i) => i !== idx)), []);
    const updateLine = useCallback((idx: number, patch: Partial<LineForm>) =>
        setLines((ls) => ls.map((l, i) => i === idx ? { ...l, ...patch } : l)), []);

    const totalDebit  = lines.filter((l) => l.type === 'debit').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const totalCredit = lines.filter((l) => l.type === 'credit').reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    const balanced    = Math.abs(totalDebit - totalCredit) < 0.001 && totalDebit > 0;

    async function save(andPost: boolean) {
        if (!companyId) return;
        const selectedPeriod = periodId || openPeriods[0]?.id;
        if (!selectedPeriod) { notify.error('No hay período contable abierto. Crea uno en la sección Períodos.'); return; }
        if (!description.trim()) { notify.error('Ingresa una descripción para el asiento.'); return; }
        if (andPost && !balanced) { notify.error('El asiento no cuadra — los débitos deben ser iguales a los créditos.'); return; }

        setSaving(true);

        const body: SaveEntryInput = {
            entry: { companyId, periodId: selectedPeriod, date, description },
            lines: lines
                .filter((l) => l.accountId && parseFloat(l.amount) > 0)
                .map((l) => ({
                    accountId:   l.accountId,
                    type:        l.type,
                    amount:      parseFloat(l.amount),
                    description: l.description || null,
                })),
        };

        try {
            const res  = await fetch('/api/accounting/entries', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const json = await res.json() as { data?: string; error?: string };
            if (!res.ok) { notify.error(json.error ?? 'No se pudo guardar el asiento. Inténtalo de nuevo.'); return; }

            if (andPost) {
                const entryId = json.data;
                const postRes = await fetch(`/api/accounting/entries/${entryId}/post`, { method: 'POST' });
                if (!postRes.ok) {
                    const postJson = await postRes.json() as { error?: string };
                    notify.error(postJson.error ?? 'El asiento se guardó pero no se pudo publicar.');
                    return;
                }
            }

            router.push('/accounting/journal');
        } catch {
            notify.error('No se pudo guardar el asiento. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                <PageHeader title="Nuevo asiento contable">
                    <BaseButton.Root as={Link} href="/accounting/journal" variant="ghost" size="sm">
                        Volver al libro
                    </BaseButton.Root>
                </PageHeader>

                <div className="flex flex-col gap-6 p-8 max-w-4xl">

                    {/* ── Header fields ──────────────────────────────── */}
                    <section
                        aria-label="Datos del asiento"
                        className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 border border-border-light rounded-xl bg-surface-1"
                    >
                        <BaseInput.Field
                            label="Fecha"
                            type="date"
                            value={date}
                            onValueChange={setDate}
                        />

                        <div className="flex flex-col">
                            <label htmlFor={`${formId}-period`} className={labelCls}>
                                Período
                            </label>
                            <select
                                id={`${formId}-period`}
                                value={periodId}
                                onChange={(e) => setPeriodId(e.target.value)}
                                className={fieldCls}
                                aria-describedby={openPeriods.length === 0 ? `${formId}-period-hint` : undefined}
                            >
                                {openPeriods.length === 0 && (
                                    <option value="">Sin períodos abiertos</option>
                                )}
                                {openPeriods.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            {openPeriods.length === 0 && (
                                <span id={`${formId}-period-hint`} className="font-mono text-[11px] text-[var(--text-warning)] mt-1.5">
                                    Crea un período abierto antes de registrar asientos.
                                </span>
                            )}
                        </div>

                        <BaseInput.Field
                            label="Descripción"
                            placeholder="Descripción del asiento"
                            value={description}
                            onValueChange={setDescription}
                        />
                    </section>

                    {/* ── Entry lines ────────────────────────────────── */}
                    <section aria-label="Líneas del asiento">
                        <div className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2 px-1 mb-2">
                            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Cuenta</span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Tipo</span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Monto</span>
                            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Nota</span>
                            <span />
                        </div>

                        <div className="flex flex-col gap-2">
                            {lines.map((line, idx) => (
                                <div key={idx} className="grid grid-cols-[2fr_1fr_1fr_2fr_auto] gap-2 items-center">
                                    <select
                                        aria-label={`Cuenta de línea ${idx + 1}`}
                                        value={line.accountId}
                                        onChange={(e) => updateLine(idx, { accountId: e.target.value })}
                                        className={fieldCls}
                                    >
                                        <option value="">— Cuenta —</option>
                                        {accounts.map((a) => (
                                            <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                                        ))}
                                    </select>

                                    <select
                                        aria-label={`Tipo de línea ${idx + 1}`}
                                        value={line.type}
                                        onChange={(e) => updateLine(idx, { type: e.target.value as 'debit' | 'credit' })}
                                        className={fieldCls}
                                    >
                                        <option value="debit">Débito</option>
                                        <option value="credit">Crédito</option>
                                    </select>

                                    <BaseInput.Field
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        placeholder="0,00"
                                        aria-label={`Monto de línea ${idx + 1}`}
                                        value={line.amount}
                                        onValueChange={(v) => updateLine(idx, { amount: v })}
                                        inputClassName="text-right"
                                    />

                                    <BaseInput.Field
                                        placeholder="Nota (opcional)"
                                        aria-label={`Nota de línea ${idx + 1}`}
                                        value={line.description}
                                        onValueChange={(v) => updateLine(idx, { description: v })}
                                    />

                                    <button
                                        type="button"
                                        onClick={() => removeLine(idx)}
                                        disabled={lines.length <= 2}
                                        aria-label={`Eliminar línea ${idx + 1}`}
                                        className="w-8 h-9 flex items-center justify-center rounded-lg text-neutral-400 hover:text-[var(--text-error)] hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                                            <path d="M1 1l8 8M9 1L1 9" />
                                        </svg>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            type="button"
                            onClick={addLine}
                            className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-light bg-surface-1 hover:border-border-medium hover:bg-surface-2 font-mono text-[12px] uppercase tracking-[0.1em] text-neutral-500 hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                        >
                            + Agregar línea
                        </button>
                    </section>

                    {/* ── Balance summary ────────────────────────────── */}
                    <div className="flex items-center gap-6 px-1">
                        <span className="font-mono text-[12px] text-neutral-400">
                            Débitos:{' '}
                            <span className="font-semibold text-foreground tabular-nums">
                                {totalDebit.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </span>
                        </span>
                        <span className="font-mono text-[12px] text-neutral-400">
                            Créditos:{' '}
                            <span className="font-semibold text-foreground tabular-nums">
                                {totalCredit.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </span>
                        </span>
                        {totalDebit > 0 && (
                            <span
                                aria-live="polite"
                                className={`font-mono text-[12px] font-semibold ${balanced ? 'text-[var(--text-success)]' : 'text-[var(--text-error)]'}`}
                            >
                                {balanced ? 'Cuadrado' : 'No cuadra'}
                            </span>
                        )}
                    </div>

                    {/* ── Actions ────────────────────────────────────── */}
                    <div className="flex gap-2">
                        <BaseButton.Root
                            type="button"
                            variant="ghost"
                            size="sm"
                            loading={saving}
                            onPress={() => { void save(false); }}
                        >
                            Guardar borrador
                        </BaseButton.Root>
                        <BaseButton.Root
                            type="button"
                            variant="primary"
                            size="sm"
                            loading={saving}
                            isDisabled={!balanced}
                            onPress={() => { void save(true); }}
                        >
                            Guardar y publicar
                        </BaseButton.Root>
                    </div>
                </div>
            </div>
        </AccountingAccessGuard>
    );
}
