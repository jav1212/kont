"use client";

// Journal entries (Libro Diario) page.
// Lists all journal entries for a company, optionally filtered by period.
// Posting an entry uses a HeroUI modal confirmation — this action is irreversible.
import { useId, useState }           from 'react';
import Link                          from 'next/link';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { PageHeader }                from '@/src/shared/frontend/components/page-header';
import { BaseButton }                from '@/src/shared/frontend/components/base-button';
import { BaseTable }                 from '@/src/shared/frontend/components/base-table';
import { AccountingAccessGuard }     from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccountingPeriods }      from '@/src/modules/accounting/frontend/hooks/use-accounting-periods';
import { useJournalEntries }         from '@/src/modules/accounting/frontend/hooks/use-journal-entries';
import type { JournalEntry }         from '@/src/modules/accounting/backend/domain/journal-entry';
import { APP_SIZES }                 from '@/src/shared/frontend/sizes';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS = { draft: 'Borrador', posted: 'Publicado' } as const;
const SOURCE_LABELS = { manual: 'Manual', payroll: 'Nómina', inventory: 'Inventario' } as const;

const fieldCls = [
    "h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = `font-mono ${APP_SIZES.text.label} uppercase text-neutral-500 dark:text-neutral-400`;

// ── Status badge ───────────────────────────────────────────────────────────────

function EntryStatusBadge({ status }: { status: 'draft' | 'posted' }) {
    if (status === 'posted') {
        return (
            <span
                aria-label="Asiento publicado"
                className="inline-flex items-center h-[22px] px-2 rounded-md border font-mono text-[11px] tracking-wide"
                style={{
                    background:   'var(--badge-success-bg)',
                    borderColor:  'var(--badge-success-border)',
                    color:        'var(--text-success)',
                }}
            >
                {STATUS_LABELS.posted}
            </span>
        );
    }
    return (
        <span
            aria-label="Asiento en borrador"
            className="inline-flex items-center h-[22px] px-2 rounded-md border font-mono text-[11px] tracking-wide"
            style={{
                background:   'var(--badge-warning-bg)',
                borderColor:  'var(--badge-warning-border)',
                color:        'var(--text-warning)',
            }}
        >
            {STATUS_LABELS.draft}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface EntryRow extends JournalEntry {
    sourceLabel: string;
}

export default function JournalPage() {
    const filterId = useId();
    const { companyId }                    = useCompany();
    const { data: periods }                = useAccountingPeriods(companyId);
    const [periodId, setPeriodId]          = useState<string>('');
    const { data, loading, error, reload } = useJournalEntries(companyId, periodId || null);
    const [postTarget, setPostTarget]      = useState<JournalEntry | null>(null);
    const [posting,    setPosting]         = useState(false);
    const [postErr,    setPostErr]         = useState<string | null>(null);

    async function confirmPost() {
        if (!postTarget) return;
        setPosting(true);
        setPostErr(null);
        try {
            const res = await fetch(`/api/accounting/entries/${postTarget.id}/post`, { method: 'POST' });
            if (!res.ok) {
                const json = await res.json() as { error?: string };
                setPostErr(json.error ?? 'No se pudo publicar el asiento.');
                return;
            }
            setPostTarget(null);
            await reload();
        } catch {
            setPostErr('No se pudo publicar el asiento.');
        } finally {
            setPosting(false);
        }
    }

    const rows: EntryRow[] = data.map((entry) => ({
        ...entry,
        sourceLabel: SOURCE_LABELS[entry.source],
    }));

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                <PageHeader title="Libro Diario">
                    <BaseButton.Root
                        as={Link}
                        href="/accounting/journal/new"
                        variant="primary"
                        size="sm"
                    >
                        Nuevo asiento
                    </BaseButton.Root>
                </PageHeader>

                <div className="flex flex-col gap-6 p-8 max-w-5xl">

                    {/* ── Period filter ──────────────────────────────── */}
                    <div className="flex items-center gap-3">
                        <label htmlFor={`${filterId}-period`} className={labelCls}>
                            Período:
                        </label>
                        <select
                            id={`${filterId}-period`}
                            value={periodId}
                            onChange={(e) => setPeriodId(e.target.value)}
                            className={`${fieldCls} w-52`}
                        >
                            <option value="">Todos los períodos</option>
                            {periods.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* ── Entries table ──────────────────────────────── */}
                    <BaseTable.Render<EntryRow>
                        columns={[
                            {
                                key: 'entryNumber',
                                label: '#',
                                render: (v) => (
                                    <span className="font-mono text-[13px] tabular-nums text-neutral-500">{String(v)}</span>
                                ),
                            },
                            {
                                key: 'date',
                                label: 'Fecha',
                                render: (v) => (
                                    <span className="font-mono text-[13px] tabular-nums text-neutral-500">{String(v)}</span>
                                ),
                            },
                            { key: 'description', label: 'Descripción' },
                            { key: 'sourceLabel',  label: 'Origen' },
                            {
                                key: 'status',
                                label: 'Estado',
                                render: (v) => <EntryStatusBadge status={v as 'draft' | 'posted'} />,
                            },
                            {
                                key: 'id',
                                label: '',
                                align: 'end',
                                render: (_v, item) => (
                                    <div className="flex items-center justify-end gap-3">
                                        <Link
                                            href={`/accounting/journal/${item.id}`}
                                            className="font-mono text-[12px] text-primary-600 hover:text-primary-700 focus-visible:outline-none focus-visible:underline transition-colors"
                                        >
                                            Ver
                                        </Link>
                                        {item.status === 'draft' && (
                                            <button
                                                type="button"
                                                onClick={() => { setPostTarget(item); setPostErr(null); }}
                                                className="font-mono text-[12px] text-neutral-500 hover:text-foreground focus-visible:outline-none focus-visible:underline transition-colors"
                                            >
                                                Publicar
                                            </button>
                                        )}
                                    </div>
                                ),
                            },
                        ]}
                        data={rows}
                        keyExtractor={(item) => item.id}
                        isLoading={loading}
                        emptyContent={
                            <div className="flex flex-col items-center gap-2">
                                <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-400">
                                    Sin asientos contables
                                </span>
                                <span className="font-mono text-[11px] text-neutral-400">
                                    Crea un nuevo asiento usando el botón de arriba.
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

            {/* ── Post confirmation modal ────────────────────────────── */}
            <Modal
                isOpen={postTarget !== null}
                onClose={() => { setPostTarget(null); setPostErr(null); }}
                size="sm"
            >
                <ModalContent>
                    <ModalHeader className="font-mono text-[13px] uppercase tracking-[0.1em]">
                        Publicar asiento
                    </ModalHeader>
                    <ModalBody>
                        <p className="font-mono text-[13px] text-neutral-600 dark:text-neutral-400">
                            ¿Publicar el asiento{' '}
                            <span className="font-semibold text-foreground">
                                #{postTarget?.entryNumber}
                            </span>
                            ? Esta acción es irreversible.
                        </p>
                        {postErr && (
                            <p role="alert" className="font-mono text-[12px] text-[var(--text-error)] mt-2">
                                {postErr}
                            </p>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <BaseButton.Root
                            variant="ghost"
                            size="sm"
                            onPress={() => { setPostTarget(null); setPostErr(null); }}
                            isDisabled={posting}
                        >
                            Cancelar
                        </BaseButton.Root>
                        <BaseButton.Root
                            variant="primary"
                            size="sm"
                            loading={posting}
                            onPress={() => { void confirmPost(); }}
                        >
                            Publicar asiento
                        </BaseButton.Root>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </AccountingAccessGuard>
    );
}
