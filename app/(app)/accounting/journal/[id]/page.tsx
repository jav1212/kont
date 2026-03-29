"use client";

// Journal entry detail page.
// Displays a single entry's metadata and its debit/credit lines.
// Draft entries can be posted from here using a modal confirmation.
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter }             from 'next/navigation';
import Link                                 from 'next/link';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { PageHeader }                       from '@/src/shared/frontend/components/page-header';
import { BaseButton }                       from '@/src/shared/frontend/components/base-button';
import { BaseTable }                        from '@/src/shared/frontend/components/base-table';
import { AccountingAccessGuard }            from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import type { EntryWithLines }              from '@/src/modules/accounting/backend/domain/repository/journal-entry.repository';

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS    = { draft: 'Borrador', posted: 'Publicado' } as const;
const SOURCE_LABELS    = { manual: 'Manual', payroll: 'Nómina', inventory: 'Inventario' } as const;
const LINE_TYPE_LABELS = { debit: 'Débito', credit: 'Crédito' } as const;

function fmtAmt(n: number) {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Status badge ───────────────────────────────────────────────────────────────

function EntryStatusBadge({ status }: { status: 'draft' | 'posted' }) {
    if (status === 'posted') {
        return (
            <span
                aria-label="Asiento publicado"
                className="inline-flex items-center h-[22px] px-2 rounded-md border font-mono text-[11px] tracking-wide"
                style={{
                    background:  'var(--badge-success-bg)',
                    borderColor: 'var(--badge-success-border)',
                    color:       'var(--text-success)',
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
                background:  'var(--badge-warning-bg)',
                borderColor: 'var(--badge-warning-border)',
                color:       'var(--text-warning)',
            }}
        >
            {STATUS_LABELS.draft}
        </span>
    );
}

// ── Line row type ─────────────────────────────────────────────────────────────

interface LineRow {
    id:          string;
    account:     string;
    typeLabel:   string;
    amountFmt:   string;
    description: string;
    type:        'debit' | 'credit';
    amount:      number;
    accountCode: string;
    accountName: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JournalEntryDetailPage() {
    const { id }                  = useParams<{ id: string }>();
    const router                  = useRouter();
    const [data,    setData]      = useState<EntryWithLines | null>(null);
    const [loading, setLoading]   = useState(true);
    const [error,   setError]     = useState<string | null>(null);
    const [showPostModal, setShowPostModal] = useState(false);
    const [posting, setPosting]   = useState(false);
    const [postErr, setPostErr]   = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res  = await fetch(`/api/accounting/entries/${id}`);
            const json = await res.json() as { data?: EntryWithLines; error?: string };
            if (!res.ok || json.error) { setError(json.error ?? 'No se pudo cargar el asiento.'); return; }
            setData(json.data ?? null);
        } catch {
            setError('No se pudo cargar el asiento.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    async function confirmPost() {
        setPosting(true);
        setPostErr(null);
        try {
            const res  = await fetch(`/api/accounting/entries/${id}/post`, { method: 'POST' });
            const json = await res.json() as { error?: string };
            if (!res.ok) { setPostErr(json.error ?? 'No se pudo publicar el asiento.'); return; }
            setShowPostModal(false);
            await load();
        } finally {
            setPosting(false);
        }
    }

    const entry  = data?.entry;
    const lines  = data?.lines ?? [];
    const totalDebit  = lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amount, 0);
    const totalCredit = lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amount, 0);

    const lineRows: LineRow[] = lines.map((l) => ({
        ...l,
        account:     `${l.accountCode} ${l.accountName}`,
        typeLabel:   LINE_TYPE_LABELS[l.type],
        amountFmt:   fmtAmt(l.amount),
        description: l.description ?? '—',
    }));

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                <PageHeader
                    title={entry ? `Asiento #${entry.entryNumber}` : 'Detalle de asiento'}
                >
                    <BaseButton.Root as={Link} href="/accounting/journal" variant="ghost" size="sm">
                        ← Libro diario
                    </BaseButton.Root>
                </PageHeader>

                <div className="flex flex-col gap-6 p-8 max-w-4xl">

                    {/* ── Loading / error ────────────────────────────── */}
                    {loading && (
                        <p className="font-mono text-[13px] text-neutral-400">Cargando asiento...</p>
                    )}
                    {error && (
                        <p role="alert" className="font-mono text-[12px] text-[var(--text-error)]">
                            {error}
                        </p>
                    )}

                    {entry && (
                        <>
                            {/* ── Metadata card ──────────────────────── */}
                            <section
                                aria-label="Datos del asiento"
                                className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 border border-border-light rounded-xl bg-surface-1"
                            >
                                <div className="flex flex-col gap-1">
                                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Fecha</span>
                                    <span className="font-mono text-[13px] tabular-nums text-foreground">{entry.date}</span>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Estado</span>
                                    <EntryStatusBadge status={entry.status} />
                                </div>

                                <div className="flex flex-col gap-1">
                                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Origen</span>
                                    <span className="font-mono text-[13px] text-neutral-500">{SOURCE_LABELS[entry.source]}</span>
                                </div>

                                {entry.sourceRef && (
                                    <div className="flex flex-col gap-1">
                                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Ref. origen</span>
                                        <span className="font-mono text-[12px] text-neutral-400 tabular-nums">
                                            {entry.sourceRef.slice(0, 8)}…
                                        </span>
                                    </div>
                                )}

                                <div className="flex flex-col gap-1 col-span-2 sm:col-span-4">
                                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Descripción</span>
                                    <span className="font-mono text-[13px] text-foreground">{entry.description}</span>
                                </div>

                                {entry.postedAt && (
                                    <div className="flex flex-col gap-1 col-span-2">
                                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-400">Publicado</span>
                                        <span className="font-mono text-[12px] text-neutral-500">
                                            {new Date(entry.postedAt).toLocaleString('es-VE')}
                                        </span>
                                    </div>
                                )}
                            </section>

                            {/* ── Lines table ────────────────────────── */}
                            <BaseTable.Render<LineRow>
                                columns={[
                                    {
                                        key: 'account',
                                        label: 'Cuenta',
                                        render: (_v, item) => (
                                            <span>
                                                <span className="font-mono text-[12px] tabular-nums text-neutral-400 mr-2">{item.accountCode}</span>
                                                <span className="font-mono text-[13px] text-foreground">{item.accountName}</span>
                                            </span>
                                        ),
                                    },
                                    { key: 'typeLabel', label: 'Tipo' },
                                    {
                                        key: 'amountFmt',
                                        label: 'Monto',
                                        align: 'end',
                                        render: (v) => (
                                            <span className="font-mono text-[13px] tabular-nums">{String(v)}</span>
                                        ),
                                    },
                                    { key: 'description', label: 'Nota' },
                                ]}
                                data={lineRows}
                                keyExtractor={(item) => item.id}
                                emptyContent="Sin líneas registradas"
                            />

                            {/* ── Totals row ─────────────────────────── */}
                            {lines.length > 0 && (
                                <div className="flex items-center gap-6 px-4 py-3 border border-border-light rounded-xl bg-surface-2">
                                    <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-neutral-400 mr-auto">
                                        Totales
                                    </span>
                                    <span className="font-mono text-[12px] text-neutral-500">
                                        D: <span className="text-foreground tabular-nums font-semibold">{fmtAmt(totalDebit)}</span>
                                    </span>
                                    <span className="font-mono text-[12px] text-neutral-500">
                                        C: <span className="text-foreground tabular-nums font-semibold">{fmtAmt(totalCredit)}</span>
                                    </span>
                                </div>
                            )}

                            {/* ── Actions ────────────────────────────── */}
                            <div className="flex items-center gap-3">
                                {entry.status === 'draft' && (
                                    <BaseButton.Root
                                        variant="primary"
                                        size="sm"
                                        onPress={() => { setShowPostModal(true); setPostErr(null); }}
                                    >
                                        Publicar asiento
                                    </BaseButton.Root>
                                )}
                                <BaseButton.Root
                                    as={Link}
                                    href="/accounting/journal"
                                    variant="ghost"
                                    size="sm"
                                >
                                    Volver al libro diario
                                </BaseButton.Root>
                            </div>

                            {postErr && (
                                <p role="alert" className="font-mono text-[12px] text-[var(--text-error)]">
                                    {postErr}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ── Post confirmation modal ────────────────────────────── */}
            <Modal
                isOpen={showPostModal}
                onClose={() => { setShowPostModal(false); setPostErr(null); }}
                size="sm"
            >
                <ModalContent>
                    <ModalHeader className="font-mono text-[13px] uppercase tracking-[0.1em]">
                        Publicar asiento
                    </ModalHeader>
                    <ModalBody>
                        <p className="font-mono text-[13px] text-neutral-600 dark:text-neutral-400">
                            ¿Publicar el asiento{' '}
                            <span className="font-semibold text-foreground">#{entry?.entryNumber}</span>?
                            Esta acción es irreversible.
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
                            onPress={() => { setShowPostModal(false); setPostErr(null); }}
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
