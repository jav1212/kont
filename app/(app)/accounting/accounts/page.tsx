"use client";

// Chart-of-accounts management page (Master-Detail).
// First asks the user to select an existing chart.
// Then shows a split view: Form to add account (left), and File Tree of accounts (right).

import { useState, useMemo }  from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ContextLink as Link } from '@/src/shared/frontend/components/context-link';
import { Folder, FileText, ArrowLeft, Plus, Trash2, ChevronRight, Check, X } from 'lucide-react';
import { PageHeader }                from '@/src/shared/frontend/components/page-header';
import { BaseButton }                from '@/src/shared/frontend/components/base-button';
import { BaseInput }                 from '@/src/shared/frontend/components/base-input';
import { AccountingAccessGuard }     from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccounts }               from '@/src/modules/accounting/frontend/hooks/use-accounts';
import { useCharts }                 from '@/src/modules/accounting/frontend/hooks/use-charts';
import { notify }                    from '@/src/shared/frontend/notify';
import type { Account }              from '@/src/modules/accounting/backend/domain/account';
import { APP_SIZES }                 from '@/src/shared/frontend/sizes';


// ── Constants ─────────────────────────────────────────────────────────────────

type Naturaleza = 'debe' | 'haber';

function typeToNaturaleza(type: string): Naturaleza {
    return type === 'asset' || type === 'expense' ? 'debe' : 'haber';
}

function naturalezaToType(n: Naturaleza): string {
    return n === 'debe' ? 'asset' : 'liability';
}

const EMPTY_FORM = {
    code:          '',
    name:          '',
    naturaleza:    'debe' as Naturaleza,
    saldoInicial:  '',
    isGroup:       false,
};

// Shared input class.
const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    "placeholder:text-neutral-400",
].join(" ");

const labelCls = `font-mono ${APP_SIZES.text.label} uppercase text-neutral-500 dark:text-neutral-400 block mb-1.5`;

// ── Tree Logic ────────────────────────────────────────────────────────────────

interface TreeNodeData {
    account: Account;
    children: TreeNodeData[];
}

function deriveParentCode(code: string): string | null {
    const parts = code.split('.');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('.');
}

function buildTree(accounts: Account[]): TreeNodeData[] {
    const map = new Map<string, TreeNodeData>();
    const roots: TreeNodeData[] = [];

    const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

    sorted.forEach(acc => {
        map.set(acc.code, { account: acc, children: [] });
    });

    sorted.forEach(acc => {
        const parentCode = acc.parentCode || deriveParentCode(acc.code);
        if (parentCode && map.has(parentCode)) {
            map.get(parentCode)!.children.push(map.get(acc.code)!);
        } else {
            roots.push(map.get(acc.code)!);
        }
    });

    return roots;
}

// ── Tree Component ────────────────────────────────────────────────────────────

function AccountTreeNode({ 
    node, level, onSelectEdit, onDeleteRequest, expandSignal, collapseSignal 
}: { 
    node: TreeNodeData, level: number, onSelectEdit: (a: Account) => void, onDeleteRequest: (a: Account) => void, expandSignal: number, collapseSignal: number
}) {
    const { account, children } = node;
    const isGroup = account.isGroup || children.length > 0;
    const [isExpanded, setIsExpanded] = useState(true);

    // Sync parent expand/collapse signals via render-time state adjustment
    const [prevSignals, setPrevSignals] = useState({ expand: expandSignal, collapse: collapseSignal });
    if (prevSignals.expand !== expandSignal && expandSignal > 0) {
        setPrevSignals(p => ({ ...p, expand: expandSignal }));
        setIsExpanded(true);
    }
    if (prevSignals.collapse !== collapseSignal && collapseSignal > 0) {
        setPrevSignals(p => ({ ...p, collapse: collapseSignal }));
        setIsExpanded(false);
    }
    
    return (
        <div className="flex flex-col">
            <div 
                className="group flex items-center justify-between py-1.5 px-3 hover:bg-surface-2/50 rounded-lg transition-colors border border-transparent hover:border-border-light/50"
                style={{ paddingLeft: `${Math.max(0.75, level * 1.5)}rem` }}
            >
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        type="button"
                        onClick={() => isGroup && setIsExpanded(!isExpanded)}
                        className={`text-[var(--text-tertiary)] flex items-center justify-center w-4 h-4 rounded hover:bg-surface-2 transition-colors ${
                            isGroup ? 'cursor-pointer group-hover:text-[var(--text-secondary)]' : 'cursor-default opacity-0'
                        }`}
                        aria-hidden={!isGroup}
                        tabIndex={isGroup ? 0 : -1}
                    >
                        <ChevronRight size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                    <div className="text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] transition-colors">
                        {isGroup ? <Folder size={14} /> : <FileText size={14} />}
                    </div>
                    <span className="font-mono text-[12px] font-bold text-[var(--text-secondary)] w-24 shrink-0 cursor-pointer select-none" onClick={() => isGroup && setIsExpanded(!isExpanded)}>
                        {account.code}
                    </span>
                    <span className="font-mono text-[12px] text-foreground truncate cursor-pointer select-none" onClick={() => isGroup && setIsExpanded(!isExpanded)}>
                        {account.name}
                    </span>
                </div>
                <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100 shrink-0">
                    {/* Only show balance on non-group detail accounts */}
                    {!isGroup && (
                        <span className="font-mono text-[11px] text-[var(--text-tertiary)] tabular-nums">
                            {Number(account.saldoInicial ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                        </span>
                    )}
                    <div className="flex items-center gap-1.5 border-l border-border-light pl-3">
                        <button
                            type="button"
                            onClick={() => onSelectEdit(account)}
                            className="font-mono text-[11px] text-primary-600 hover:text-primary-700 transition-colors"
                        >
                            Editar
                        </button>
                        <button
                            type="button"
                            onClick={() => onDeleteRequest(account)}
                            className="text-[var(--text-tertiary)] hover:text-red-500 transition-colors bg-surface-2 group-hover:bg-transparent rounded-md p-1"
                            title="Eliminar cuenta"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                </div>
            </div>
            {isGroup && isExpanded && children.length > 0 && (
                <div className="flex flex-col ml-[calc(1rem+6px)] pl-2 border-l border-border-light/30">
                    {children.map(child => (
                        <AccountTreeNode 
                            key={child.account.id} 
                            node={child} 
                            level={level + 1} 
                            onSelectEdit={onSelectEdit} 
                            onDeleteRequest={onDeleteRequest} 
                            expandSignal={expandSignal}
                            collapseSignal={collapseSignal}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AccountsPage() {
    const { companyId }                    = useCompany();
    const { data: allAccounts, loading: accountsLoading, reload: reloadAccounts } = useAccounts(companyId);
    const { data: charts, loading: chartsLoading }                 = useCharts(companyId);

    // Explorer State
    const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
    const selectedChart = charts.find(c => c.id === selectedChartId) || null;

    // Form State
    const [form,         setForm]         = useState(EMPTY_FORM);
    const [editing,      setEditing]      = useState<string | null>(null);
    const [saving,       setSaving]       = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
    const [deleting,     setDeleting]     = useState(false);
    const [showSuccessMsg, setShowSuccessMsg] = useState(false);

    // ── Computed accounts for selected chart
    const chartAccounts = useMemo(() => {
        if (!selectedChartId) return [];
        return allAccounts.filter(a => a.chartId === selectedChartId);
    }, [allAccounts, selectedChartId]);

    const accountTree = useMemo(() => buildTree(chartAccounts), [chartAccounts]);
    
    // ── Tree Expansion Signals 
    const [expandSignal, setExpandSignal] = useState(0);
    const [collapseSignal, setCollapseSignal] = useState(0);

    // ── Edit helpers ───────────────────────────────────────────────────────────

    function startEdit(account: Account) {
        setEditing(account.id);
        setForm({
            code:         account.code,
            name:         account.name,
            naturaleza:   typeToNaturaleza(account.type),
            saldoInicial: String(account.saldoInicial ?? 0),
            isGroup:      account.isGroup,
        });
        setShowSuccessMsg(false);
    }

    function cancelEdit() {
        setEditing(null);
        setForm(EMPTY_FORM);
    }

    // ── Submit ─────────────────────────────────────────────────────────────────

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!companyId || !selectedChartId) return;
        setSaving(true);
        setShowSuccessMsg(false);
        try {
            const body = {
                ...(editing ? { id: editing } : {}),
                companyId,
                chartId:      selectedChartId,
                code:         form.code.trim(),
                name:         form.name.trim(),
                type:         naturalezaToType(form.naturaleza),
                parentCode:   deriveParentCode(form.code.trim()),
                isActive:     true,
                isGroup:      form.isGroup,
                saldoInicial: parseFloat(form.saldoInicial.replace(',', '.')) || 0,
            };
            const res  = await fetch('/api/accounting/accounts', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body),
            });
            const json = await res.json() as { error?: string };
            if (!res.ok) { notify.error(json.error ?? 'No se pudo guardar la cuenta.'); return; }

            if (!editing) setShowSuccessMsg(true);
            setTimeout(() => setShowSuccessMsg(false), 3000);

            cancelEdit();
            await reloadAccounts();
        } catch {
            notify.error('No se pudo guardar la cuenta. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    }

    // ── Delete ─────────────────────────────────────────────────────────────────

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/accounting/accounts/${deleteTarget.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const json = await res.json() as { error?: string };
                notify.error(json.error ?? 'No se pudo eliminar la cuenta.');
                return;
            }
            setDeleteTarget(null);
            await reloadAccounts();
        } catch {
            notify.error('No se pudo eliminar la cuenta.');
        } finally {
            setDeleting(false);
        }
    }

    // ── Pre-Select View ───────────────────────────────────────────────────────

    const renderSelectorView = () => (
        <div className="flex flex-col gap-6 p-8 max-w-4xl mx-auto w-full">
            <h2 className="text-[18px] font-bold tracking-tight text-foreground">
                Selecciona un Plan para gestionar
            </h2>
            <p className="font-mono text-[13px] text-[var(--text-tertiary)] -mt-4">
                Elige de qué plan de cuentas deseas crear, editar o eliminar cuentas contables.
            </p>

            {chartsLoading && (
                <div className="flex items-center justify-center p-8 bg-surface-1 rounded-2xl border border-border-light">
                    <span className="font-mono text-[13px] text-[var(--text-tertiary)] animate-pulse">Cargando planes...</span>
                </div>
            )}

            {!chartsLoading && charts.length === 0 && (
                <div className="flex flex-col items-center justify-center p-12 bg-surface-1 rounded-2xl border border-dashed border-border-light gap-4">
                    <Folder size={32} className="text-[var(--text-tertiary)]" />
                    <span className="font-mono text-[13px] text-[var(--text-secondary)]">No tienes ningún plan de cuentas</span>
                    <Link href="/accounting/charts" className="font-mono text-[12px] text-primary-500 hover:underline">
                        Ir a crear un plan de cuentas &rarr;
                    </Link>
                </div>
            )}

            {!chartsLoading && charts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {charts.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedChartId(c.id)}
                            className="group flex flex-col items-start gap-1 p-5 bg-surface-1 border border-border-light hover:border-primary-500/40 rounded-2xl transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                            <div className="flex items-center justify-between w-full">
                                <span className="font-bold text-[15px]">{c.name}</span>
                                <ChevronRight size={16} className="text-[var(--text-tertiary)] group-hover:text-primary-500 transition-colors" />
                            </div>
                            <span className="font-mono text-[11px] text-[var(--text-tertiary)] tracking-widest uppercase">
                                {c.accountCount.toLocaleString('es-VE')} Cuentas vinculadas
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );

    // ── Main Detail View ──────────────────────────────────────────────────────

    const renderDetailView = () => (
        <div className="flex flex-col gap-6 p-6 w-full h-full min-h-[80vh]">
            <div className="flex items-center gap-3 border-b border-border-light pb-4">
                <BaseButton.Icon variant="ghost" size="sm" onClick={() => setSelectedChartId(null)} className="mr-2">
                    <ArrowLeft size={16} />
                </BaseButton.Icon>
                <div className="w-10 h-10 shrink-0 rounded-xl bg-surface-2 flex items-center justify-center border border-border-light text-[var(--text-secondary)]">
                    <FileText size={18} />
                </div>
                <div>
                    <h2 className="text-[20px] font-bold tracking-tight text-foreground leading-none">
                        {selectedChart?.name ?? 'Plan Desconocido'}
                    </h2>
                    <p className="font-mono text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest pt-1">
                        Explorador de Cuentas
                    </p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start h-full pb-10">
                {/* ── Pane Izquierdo: Formulario ── */}
                <div className="w-full lg:w-[340px] shrink-0 sticky top-6">
                    <section className="flex flex-col gap-4 p-5 border border-border-light rounded-2xl bg-surface-1 shadow-sm">
                        <div className="flex items-center gap-2 mb-2 pb-3 border-b border-border-light/60">
                            {editing ? (
                                <FileText size={16} className="text-primary-500" />
                            ) : (
                                <Plus size={16} className="text-primary-500" />
                            )}
                            <h3 className="text-[14px] font-bold text-foreground">
                                {editing ? 'Editar Cuenta' : 'Nueva Cuenta'}
                            </h3>
                        </div>
                        
                        <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3">
                            <BaseInput.Field
                                label="Código"
                                isRequired
                                placeholder="Ej: 1.1.01.001"
                                value={form.code}
                                onValueChange={(v) => setForm(f => ({ ...f, code: v }))}
                            />
                            <BaseInput.Field
                                label="Descripción"
                                isRequired
                                placeholder="Ej: Banco Mercantil"
                                value={form.name}
                                onValueChange={(v) => setForm(f => ({ ...f, name: v }))}
                            />
                            {!form.isGroup && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="flex flex-col">
                                        <label htmlFor="acc-nat" className={labelCls}>Naturaleza</label>
                                        <select
                                            id="acc-nat" value={form.naturaleza}
                                            onChange={(e) => setForm(f => ({ ...f, naturaleza: e.target.value as Naturaleza }))}
                                            className={fieldCls}
                                        >
                                            <option value="debe">Debe</option>
                                            <option value="haber">Haber</option>
                                        </select>
                                    </div>
                                    <BaseInput.Field
                                        label="Saldo Inic."
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0,00"
                                        value={form.saldoInicial}
                                        onValueChange={(v) => setForm(f => ({ ...f, saldoInicial: v }))}
                                        inputClassName="text-right"
                                    />
                                </div>
                            )}
                            
                            <div className="flex items-center gap-2 mt-2">
                                <input
                                    type="checkbox"
                                    id="acc-is-group"
                                    checked={form.isGroup}
                                    onChange={(e) => setForm(f => ({ ...f, isGroup: e.target.checked, saldoInicial: e.target.checked ? '' : f.saldoInicial }))}
                                    className="w-4 h-4 rounded border-border-light text-primary-600 focus:ring-primary-500 bg-surface-1"
                                />
                                <label htmlFor="acc-is-group" className="font-mono text-[12px] text-[var(--text-secondary)] select-none cursor-pointer">
                                    Es carpeta de agrupación
                                </label>
                            </div>
                            
                            {showSuccessMsg && <p className="font-mono text-[11px] text-success mt-1 flex items-center gap-1.5 bg-success/10 p-2 rounded-lg"><Check size={12}/> Cuenta añadida</p>}
                            
                            <div className="flex gap-2 pt-2 mt-1">
                                <BaseButton.Root type="submit" variant="primary" size="sm" loading={saving} className="flex-1 text-sm h-9">
                                    {editing ? 'Guardar Cambios' : 'Anexar Cuenta'}
                                </BaseButton.Root>
                                {editing && (
                                    <BaseButton.Root type="button" variant="ghost" size="sm" onPress={cancelEdit} className="h-9">
                                        Cancelar
                                    </BaseButton.Root>
                                )}
                            </div>
                        </form>
                    </section>
                </div>

                {/* ── Pane Derecho: Layout del Árbol ── */}
                <div className="flex-1 w-full bg-surface-1 border border-border-light rounded-2xl overflow-hidden shadow-sm flex flex-col relative min-h-[400px]">
                    <div className="px-5 py-3 border-b border-border-light flex items-center justify-between bg-surface-2/30 z-10 sticky top-0">
                        <div className="flex items-center gap-3">
                            <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-[var(--text-tertiary)] font-semibold">
                                Árbol Jerárquico ({chartAccounts.length})
                            </span>
                            {accountsLoading && <span className="font-mono text-[10px] text-primary-500 animate-pulse">Refrescando...</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setExpandSignal(s => s + 1)}
                                className="font-mono text-[10px] uppercase text-[var(--text-tertiary)] hover:text-primary-500 transition-colors px-2 py-1 rounded-md hover:bg-surface-2"
                            >
                                Expandir todo
                            </button>
                            <button
                                type="button"
                                onClick={() => setCollapseSignal(s => s + 1)}
                                className="font-mono text-[10px] uppercase text-[var(--text-tertiary)] hover:text-primary-500 transition-colors px-2 py-1 rounded-md hover:bg-surface-2"
                            >
                                Colapsar todo
                            </button>
                        </div>
                    </div>
                    
                    <div className="p-3 overflow-y-auto w-full flex-1 min-h-[50vh]">
                        {chartAccounts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40">
                                <FileText className="text-[var(--text-disabled)] mb-3" size={24} />
                                <p className="font-mono text-[12px] text-[var(--text-tertiary)] mb-1">
                                    Este plan está vacío.
                                </p>
                                <p className="font-mono text-[11px] text-[var(--text-disabled)]">
                                    Añade la primera cuenta usando el formulario.
                                </p>
                            </div>
                        ) : (
                            accountTree.map(rootNode => (
                                <AccountTreeNode 
                                    key={rootNode.account.id} 
                                    node={rootNode} 
                                    level={0} 
                                    onSelectEdit={startEdit}
                                    onDeleteRequest={(acc) => { setDeleteTarget(acc); }} 
                                    expandSignal={expandSignal}
                                    collapseSignal={collapseSignal}
                                />
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // ── Render General ────────────────────────────────────────────────────────

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full">
                {!selectedChartId && <PageHeader title="Cuentas" />}
                
                {selectedChartId ? renderDetailView() : renderSelectorView()}
                
                {/* ── Delete Modal ── */}
                <AnimatePresence>
                    {deleteTarget !== null && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => { setDeleteTarget(null); }}
                                className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                className="relative w-full max-w-sm bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                            >
                                <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-2/30">
                                    <h2 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                        Eliminar cuenta
                                    </h2>
                                    <BaseButton.Icon variant="ghost" size="sm" onClick={() => { setDeleteTarget(null); }}>
                                        <X size={14} />
                                    </BaseButton.Icon>
                                </div>
                                
                                <div className="p-6">
                                    <p className="font-mono text-[13px] text-neutral-600 dark:text-neutral-400">
                                        ¿Eliminar la cuenta{' '}
                                        <span className="font-semibold text-foreground">
                                            {deleteTarget?.code} — {deleteTarget?.name}
                                        </span>
                                        ? Esta acción no se puede deshacer.
                                    </p>
                                </div>
                                
                                <div className="px-6 py-4 border-t border-border-light bg-surface-2/30 flex justify-end gap-3">
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
                                        Eliminar
                                    </BaseButton.Root>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </AccountingAccessGuard>
    );
}
