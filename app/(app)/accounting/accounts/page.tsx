"use client";

// Chart-of-accounts management page.
// Lists accounts for the selected company and supports create/edit/delete.
// Destructive actions use a modal confirmation instead of window.confirm().
import { useId, useState }            from 'react';
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from '@heroui/react';
import { PageHeader }                 from '@/src/shared/frontend/components/page-header';
import { BaseButton }                 from '@/src/shared/frontend/components/base-button';
import { BaseTable }                  from '@/src/shared/frontend/components/base-table';
import { AccountingAccessGuard }      from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                 from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccounts }                from '@/src/modules/accounting/frontend/hooks/use-accounts';
import type { Account, AccountType }  from '@/src/modules/accounting/backend/domain/account';
import { APP_SIZES }                  from '@/src/shared/frontend/sizes';

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
    asset:     'Activo',
    liability: 'Pasivo',
    equity:    'Patrimonio',
    revenue:   'Ingreso',
    expense:   'Gasto',
};

const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];

const EMPTY_FORM = { code: '', name: '', type: 'asset' as AccountType, parentCode: '', isActive: true };

// Shared input class — canonical field style matching other pages in this project.
const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    "placeholder:text-neutral-400",
].join(" ");

const labelCls = `font-mono ${APP_SIZES.text.label} uppercase text-neutral-500 dark:text-neutral-400 block mb-1.5`;

// ── Table columns ─────────────────────────────────────────────────────────────

interface AccountRow extends Account {
    typeLabel: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AccountsPage() {
    const formId = useId();
    const { companyId }                    = useCompany();
    const { data, loading, error, reload } = useAccounts(companyId);
    const [form,      setForm]             = useState(EMPTY_FORM);
    const [editing,   setEditing]          = useState<string | null>(null);
    const [saving,    setSaving]           = useState(false);
    const [formErr,   setFormErr]          = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget]  = useState<Account | null>(null);
    const [deleting,  setDeleting]         = useState(false);
    const [deleteErr, setDeleteErr]        = useState<string | null>(null);

    function startEdit(account: Account) {
        setEditing(account.id);
        setForm({
            code:       account.code,
            name:       account.name,
            type:       account.type,
            parentCode: account.parentCode ?? '',
            isActive:   account.isActive,
        });
        setFormErr(null);
        // Scroll to form
        document.getElementById(formId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cancelEdit() {
        setEditing(null);
        setForm(EMPTY_FORM);
        setFormErr(null);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!companyId) return;
        setSaving(true);
        setFormErr(null);
        try {
            const body = {
                ...(editing ? { id: editing } : {}),
                companyId,
                code:       form.code.trim(),
                name:       form.name.trim(),
                type:       form.type,
                parentCode: form.parentCode.trim() || null,
                isActive:   form.isActive,
            };
            const res  = await fetch('/api/accounting/accounts', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const json = await res.json() as { error?: string };
            if (!res.ok) { setFormErr(json.error ?? 'No se pudo guardar la cuenta. Inténtalo de nuevo.'); return; }
            cancelEdit();
            await reload();
        } catch {
            setFormErr('No se pudo guardar la cuenta. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteErr(null);
        try {
            const res = await fetch(`/api/accounting/accounts/${deleteTarget.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const json = await res.json() as { error?: string };
                setDeleteErr(json.error ?? 'No se pudo eliminar la cuenta.');
                return;
            }
            setDeleteTarget(null);
            await reload();
        } catch {
            setDeleteErr('No se pudo eliminar la cuenta.');
        } finally {
            setDeleting(false);
        }
    }

    const rows: AccountRow[] = data.map((acc) => ({
        ...acc,
        typeLabel: ACCOUNT_TYPE_LABELS[acc.type],
    }));

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                <PageHeader title="Plan de Cuentas" />

                <div className="flex flex-col gap-6 p-8 max-w-4xl">

                    {/* ── Form ──────────────────────────────────────────── */}
                    <section
                        id={formId}
                        aria-label={editing ? 'Editar cuenta contable' : 'Nueva cuenta contable'}
                        className="flex flex-col gap-4 p-5 border border-border-light rounded-xl bg-surface-1"
                    >
                        <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] text-neutral-500">
                            {editing ? 'Editar cuenta' : 'Nueva cuenta'}
                        </h2>

                        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-4">
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                {/* Code */}
                                <div className="flex flex-col sm:col-span-1">
                                    <label htmlFor={`${formId}-code`} className={labelCls}>
                                        Código
                                    </label>
                                    <input
                                        id={`${formId}-code`}
                                        required
                                        placeholder="Ej. 1.1.01"
                                        value={form.code}
                                        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                                        className={fieldCls}
                                    />
                                </div>

                                {/* Name */}
                                <div className="flex flex-col sm:col-span-2">
                                    <label htmlFor={`${formId}-name`} className={labelCls}>
                                        Nombre
                                    </label>
                                    <input
                                        id={`${formId}-name`}
                                        required
                                        placeholder="Nombre de la cuenta"
                                        value={form.name}
                                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                        className={fieldCls}
                                    />
                                </div>

                                {/* Type */}
                                <div className="flex flex-col sm:col-span-1">
                                    <label htmlFor={`${formId}-type`} className={labelCls}>
                                        Tipo
                                    </label>
                                    <select
                                        id={`${formId}-type`}
                                        value={form.type}
                                        onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as AccountType }))}
                                        className={fieldCls}
                                    >
                                        {ACCOUNT_TYPES.map((t) => (
                                            <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Parent code */}
                                <div className="flex flex-col sm:col-span-2">
                                    <label htmlFor={`${formId}-parent`} className={labelCls}>
                                        Código de cuenta padre
                                        <span className="ml-1 normal-case tracking-normal text-neutral-400">(opcional)</span>
                                    </label>
                                    <input
                                        id={`${formId}-parent`}
                                        placeholder="Ej. 1.1"
                                        value={form.parentCode}
                                        onChange={(e) => setForm((f) => ({ ...f, parentCode: e.target.value }))}
                                        className={fieldCls}
                                    />
                                </div>
                            </div>

                            {formErr && (
                                <p role="alert" className="font-mono text-[12px] text-[var(--text-error)]">
                                    {formErr}
                                </p>
                            )}

                            <div className="flex gap-2">
                                <BaseButton.Root
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    loading={saving}
                                >
                                    {editing ? 'Actualizar cuenta' : 'Agregar cuenta'}
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

                    {/* ── Table ─────────────────────────────────────────── */}
                    <BaseTable.Render<AccountRow>
                        columns={[
                            {
                                key: 'code',
                                label: 'Código',
                                render: (v) => (
                                    <span className="font-mono text-[13px] tabular-nums text-neutral-500">{String(v)}</span>
                                ),
                            },
                            { key: 'name',      label: 'Nombre' },
                            { key: 'typeLabel', label: 'Tipo' },
                            {
                                key: 'parentCode',
                                label: 'Padre',
                                render: (v) => (
                                    <span className="font-mono text-[13px] tabular-nums text-neutral-400">
                                        {v ? String(v) : '—'}
                                    </span>
                                ),
                            },
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
                                            onClick={() => { setDeleteTarget(item); setDeleteErr(null); }}
                                            className="font-mono text-[12px] text-[var(--text-error)] hover:opacity-70 focus-visible:outline-none focus-visible:underline transition-opacity"
                                        >
                                            Eliminar
                                        </button>
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
                                    Sin cuentas registradas
                                </span>
                                <span className="font-mono text-[11px] text-neutral-400">
                                    Agrega tu primera cuenta usando el formulario de arriba.
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

            {/* ── Delete confirmation modal ──────────────────────────── */}
            <Modal
                isOpen={deleteTarget !== null}
                onClose={() => { setDeleteTarget(null); setDeleteErr(null); }}
                size="sm"
            >
                <ModalContent>
                    <ModalHeader className="font-mono text-[13px] uppercase tracking-[0.1em]">
                        Eliminar cuenta
                    </ModalHeader>
                    <ModalBody>
                        <p className="font-mono text-[13px] text-neutral-600 dark:text-neutral-400">
                            ¿Eliminar la cuenta{' '}
                            <span className="font-semibold text-foreground">
                                {deleteTarget?.code} — {deleteTarget?.name}
                            </span>
                            ? Esta acción no se puede deshacer.
                        </p>
                        {deleteErr && (
                            <p role="alert" className="font-mono text-[12px] text-[var(--text-error)] mt-2">
                                {deleteErr}
                            </p>
                        )}
                    </ModalBody>
                    <ModalFooter>
                        <BaseButton.Root
                            variant="ghost"
                            size="sm"
                            onPress={() => { setDeleteTarget(null); setDeleteErr(null); }}
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
                            Eliminar cuenta
                        </BaseButton.Root>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </AccountingAccessGuard>
    );
}
