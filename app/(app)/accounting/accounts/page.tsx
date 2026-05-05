"use client";

// Chart-of-accounts management page (Master-Detail).
// Selector view: chooses one of the company's plans, with KPI strip + plan grid.
// Detail view: KPI strip + form (left) and filterable hierarchical tree (right).

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams }              from 'next/navigation';
import { motion, AnimatePresence }      from 'framer-motion';
import {
    Folder, FolderOpen, FileText, ArrowLeft, Plus, Trash2,
    ChevronRight, Check, X, Search, Library, Layers, FolderTree,
    Wallet, Pencil, Sparkles,
} from 'lucide-react';

import { ContextLink as Link }       from '@/src/shared/frontend/components/context-link';
import { PageHeader }                from '@/src/shared/frontend/components/page-header';
import { BaseButton }                from '@/src/shared/frontend/components/base-button';
import { BaseInput }                 from '@/src/shared/frontend/components/base-input';
import { DashboardKpiCard }          from '@/src/shared/frontend/components/dashboard-kpi-card';
import { AccountingAccessGuard }     from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                from '@/src/modules/companies/frontend/hooks/use-companies';
import { useAccounts }               from '@/src/modules/accounting/frontend/hooks/use-accounts';
import { useCharts }                 from '@/src/modules/accounting/frontend/hooks/use-charts';
import { notify }                    from '@/src/shared/frontend/notify';
import type { Account }              from '@/src/modules/accounting/backend/domain/account';

// ── Constants & helpers ──────────────────────────────────────────────────────

type Naturaleza = 'debe' | 'haber';

const EMPTY_FORM = {
    code:         '',
    name:         '',
    naturaleza:   'debe' as Naturaleza,
    saldoInicial: '',
    isGroup:      false,
};

function typeToNaturaleza(type: string): Naturaleza {
    return type === 'asset' || type === 'expense' ? 'debe' : 'haber';
}

function naturalezaToType(n: Naturaleza): string {
    return n === 'debe' ? 'asset' : 'liability';
}

function deriveParentCode(code: string): string | null {
    const parts = code.split('.');
    if (parts.length <= 1) return null;
    return parts.slice(0, -1).join('.');
}

function fmtBs(n: number): string {
    return n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Tree types & build ───────────────────────────────────────────────────────

interface TreeNodeData {
    account:        Account;
    children:       TreeNodeData[];
    aggregateSaldo: number;
}

function buildTree(accounts: Account[]): TreeNodeData[] {
    const map: Map<string, TreeNodeData> = new Map();
    const roots: TreeNodeData[] = [];
    const sorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

    sorted.forEach(acc => map.set(acc.code, { account: acc, children: [], aggregateSaldo: 0 }));
    sorted.forEach(acc => {
        const parentCode = acc.parentCode || deriveParentCode(acc.code);
        if (parentCode && map.has(parentCode)) {
            map.get(parentCode)!.children.push(map.get(acc.code)!);
        } else {
            roots.push(map.get(acc.code)!);
        }
    });

    function aggregate(node: TreeNodeData): number {
        if (node.children.length === 0) {
            const v = node.account.saldoInicial ?? 0;
            node.aggregateSaldo = v;
            return v;
        }
        let sum = 0;
        for (const c of node.children) sum += aggregate(c);
        node.aggregateSaldo = sum;
        return sum;
    }
    for (const r of roots) aggregate(r);
    return roots;
}

function findVisibleCodes(nodes: TreeNodeData[], query: string): Set<string> {
    const visible = new Set<string>();
    const q = query.trim().toLowerCase();
    if (!q) return visible;

    function walk(node: TreeNodeData, ancestors: string[]): boolean {
        const matches =
            node.account.code.toLowerCase().includes(q) ||
            node.account.name.toLowerCase().includes(q);
        let childMatch = false;
        for (const c of node.children) {
            if (walk(c, [...ancestors, node.account.code])) childMatch = true;
        }
        if (matches || childMatch) {
            visible.add(node.account.code);
            ancestors.forEach(a => visible.add(a));
            return true;
        }
        return false;
    }
    for (const root of nodes) walk(root, []);
    return visible;
}

// ── Naturaleza toggle (form) ─────────────────────────────────────────────────

function NaturalezaToggle({ value, onChange }: { value: Naturaleza; onChange: (n: Naturaleza) => void }) {
    return (
        <div className="flex rounded-lg border border-border-light overflow-hidden shrink-0">
            <button
                type="button"
                onClick={() => onChange('debe')}
                className={[
                    'px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.10em] transition-colors flex-1',
                    value === 'debe'
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-1 text-text-secondary hover:bg-surface-2',
                ].join(' ')}
            >
                Debe
            </button>
            <button
                type="button"
                onClick={() => onChange('haber')}
                className={[
                    'px-3 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.10em] transition-colors flex-1 border-l border-border-light',
                    value === 'haber'
                        ? 'bg-violet-500 text-white'
                        : 'bg-surface-1 text-text-secondary hover:bg-surface-2',
                ].join(' ')}
            >
                Haber
            </button>
        </div>
    );
}

// ── Naturaleza chip (tree row) ───────────────────────────────────────────────

function NaturalezaChip({ n }: { n: Naturaleza }) {
    return (
        <span
            aria-label={`Naturaleza ${n}`}
            title={n === 'debe' ? 'Naturaleza Debe' : 'Naturaleza Haber'}
            className="inline-flex w-[20px] h-[18px] items-center justify-center rounded font-mono text-[9px] font-bold bg-surface-2 border border-border-light text-text-tertiary uppercase shrink-0"
        >
            {n === 'debe' ? 'D' : 'H'}
        </span>
    );
}

// ── Tree node ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
    node:            TreeNodeData;
    level:           number;
    onSelectEdit:    (a: Account) => void;
    onDeleteRequest: (a: Account) => void;
    expandSignal:    number;
    collapseSignal:  number;
    forceVisible:    Set<string> | null;
    activeId:        string | null;
}

function AccountTreeNode({
    node, level, onSelectEdit, onDeleteRequest,
    expandSignal, collapseSignal, forceVisible, activeId,
}: TreeNodeProps) {
    const { account, children, aggregateSaldo } = node;
    const isGroup = account.isGroup || children.length > 0;
    const isActive = activeId === account.id;

    const filtering = forceVisible !== null;
    const [isExpanded, setIsExpanded] = useState(true);
    const [prevSignals, setPrevSignals] = useState({ expand: expandSignal, collapse: collapseSignal });

    if (prevSignals.expand !== expandSignal && expandSignal > 0) {
        setPrevSignals(p => ({ ...p, expand: expandSignal }));
        setIsExpanded(true);
    }
    if (prevSignals.collapse !== collapseSignal && collapseSignal > 0) {
        setPrevSignals(p => ({ ...p, collapse: collapseSignal }));
        setIsExpanded(false);
    }

    const expanded = filtering ? true : isExpanded;
    const visibleChildren = filtering
        ? children.filter(c => forceVisible!.has(c.account.code))
        : children;

    const naturaleza = typeToNaturaleza(account.type);
    const saldo      = isGroup ? aggregateSaldo : (account.saldoInicial ?? 0);

    return (
        <div className="flex flex-col">
            <div
                className={[
                    'group flex items-center gap-3 pr-2 py-1.5 rounded-lg',
                    'border transition-colors duration-150',
                    isActive
                        ? 'bg-primary-500/8 border-primary-500/30'
                        : 'border-transparent hover:bg-surface-2/60 hover:border-border-light/60',
                ].join(' ')}
                style={{ paddingLeft: `${10 + level * 18}px` }}
            >
                {/* Chevron */}
                <button
                    type="button"
                    onClick={() => isGroup && setIsExpanded(!isExpanded)}
                    className={[
                        'flex items-center justify-center w-4 h-4 rounded transition-colors shrink-0',
                        isGroup
                            ? 'cursor-pointer text-text-tertiary group-hover:text-text-secondary'
                            : 'cursor-default opacity-0 pointer-events-none',
                    ].join(' ')}
                    aria-label={isGroup ? (expanded ? 'Colapsar' : 'Expandir') : undefined}
                    aria-expanded={isGroup ? expanded : undefined}
                    tabIndex={isGroup ? 0 : -1}
                >
                    <ChevronRight size={14} className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Folder / file glyph */}
                <div className={`shrink-0 ${isGroup ? 'text-primary-500/70' : 'text-text-tertiary'}`}>
                    {isGroup
                        ? (expanded ? <FolderOpen size={14} strokeWidth={2} /> : <Folder size={14} strokeWidth={2} />)
                        : <FileText size={13} strokeWidth={2} />}
                </div>

                {/* Code */}
                <span
                    className={[
                        'font-mono text-[12px] tabular-nums shrink-0 select-text',
                        isGroup ? 'font-bold text-foreground' : 'font-medium text-text-secondary',
                    ].join(' ')}
                    style={{ minWidth: 96 }}
                >
                    {account.code}
                </span>

                {/* Name + child-count hint for groups */}
                <span
                    className={[
                        'font-mono text-[13px] truncate flex-1 select-text',
                        isGroup ? 'font-semibold text-foreground cursor-pointer' : 'text-foreground',
                    ].join(' ')}
                    onClick={() => isGroup && setIsExpanded(!isExpanded)}
                >
                    {account.name}
                    {isGroup && children.length > 0 && (
                        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary font-normal">
                            ({children.length} {children.length === 1 ? 'subcuenta' : 'subcuentas'})
                        </span>
                    )}
                </span>

                {/* Naturaleza chip — leaves only */}
                {!isGroup && <NaturalezaChip n={naturaleza} />}

                {/* Saldo (always visible) */}
                <span
                    className={[
                        'font-mono text-[12px] tabular-nums whitespace-nowrap shrink-0',
                        'min-w-[140px] text-right',
                        isGroup ? 'text-text-tertiary' : 'text-foreground',
                    ].join(' ')}
                    title={isGroup ? 'Saldo agregado de subcuentas' : 'Saldo inicial'}
                >
                    <span className="text-[10px] mr-1 text-text-tertiary">Bs.</span>
                    {fmtBs(saldo)}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 pl-1">
                    <button
                        type="button"
                        onClick={() => onSelectEdit(account)}
                        aria-label={`Editar ${account.code}`}
                        className="flex items-center justify-center h-7 w-7 rounded-md text-text-tertiary hover:text-primary-500 hover:bg-primary-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 opacity-50 group-hover:opacity-100 focus:opacity-100"
                    >
                        <Pencil size={12} strokeWidth={2.2} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onDeleteRequest(account)}
                        aria-label={`Eliminar ${account.code}`}
                        className="flex items-center justify-center h-7 w-7 rounded-md text-text-tertiary hover:text-text-error hover:bg-text-error/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-error/40 opacity-50 group-hover:opacity-100 focus:opacity-100"
                    >
                        <Trash2 size={12} strokeWidth={2.2} />
                    </button>
                </div>
            </div>

            {isGroup && expanded && visibleChildren.length > 0 && (
                <div className="flex flex-col">
                    {visibleChildren.map(child => (
                        <AccountTreeNode
                            key={child.account.id}
                            node={child}
                            level={level + 1}
                            onSelectEdit={onSelectEdit}
                            onDeleteRequest={onDeleteRequest}
                            expandSignal={expandSignal}
                            collapseSignal={collapseSignal}
                            forceVisible={forceVisible}
                            activeId={activeId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AccountsPage() {
    const { companyId } = useCompany();
    const { data: allAccounts, loading: accountsLoading, reload: reloadAccounts } = useAccounts(companyId);
    const { data: charts, loading: chartsLoading } = useCharts(companyId);
    const searchParams = useSearchParams();
    const chartFromUrl = searchParams.get('chart');

    // ── Explorer state ───────────────────────────────────────────────────────
    const [selectedChartId, setSelectedChartId] = useState<string | null>(null);
    const selectedChart = charts.find(c => c.id === selectedChartId) || null;

    useEffect(() => {
        if (!chartFromUrl || selectedChartId) return;
        if (charts.some(c => c.id === chartFromUrl)) {
            setSelectedChartId(chartFromUrl);
        }
    }, [chartFromUrl, charts, selectedChartId]);

    // ── Form state ───────────────────────────────────────────────────────────
    const [form,           setForm]           = useState(EMPTY_FORM);
    const [editing,        setEditing]        = useState<string | null>(null);
    const [saving,         setSaving]         = useState(false);
    const [deleteTarget,   setDeleteTarget]   = useState<Account | null>(null);
    const [deleting,       setDeleting]       = useState(false);
    const [showSuccessMsg, setShowSuccessMsg] = useState(false);
    const [filter,         setFilter]         = useState('');

    // ── Derived data ─────────────────────────────────────────────────────────
    const chartAccounts = useMemo(() => {
        if (!selectedChartId) return [];
        return allAccounts.filter(a => a.chartId === selectedChartId);
    }, [allAccounts, selectedChartId]);

    const accountTree = useMemo(() => buildTree(chartAccounts), [chartAccounts]);

    const detailMetrics = useMemo(() => {
        let detail = 0, group = 0, totalSaldo = 0, maxLevel = 0;
        for (const a of chartAccounts) {
            const lvl = a.code.split('.').length;
            if (lvl > maxLevel) maxLevel = lvl;
            if (a.isGroup) {
                group++;
            } else {
                detail++;
                totalSaldo += (a.saldoInicial ?? 0);
            }
        }
        return { total: chartAccounts.length, detail, group, totalSaldo, maxLevel };
    }, [chartAccounts]);

    const visibleCodes = useMemo(() => {
        if (!filter.trim()) return null;
        return findVisibleCodes(accountTree, filter);
    }, [accountTree, filter]);

    const totalAcrossPlans = allAccounts.length;
    const largestChart = useMemo(() => {
        if (charts.length === 0) return null;
        return charts.reduce(
            (max, c) => (c.accountCount > (max?.accountCount ?? -1) ? c : max),
            charts[0],
        );
    }, [charts]);

    // ── Tree expand/collapse signals ─────────────────────────────────────────
    const [expandSignal,   setExpandSignal]   = useState(0);
    const [collapseSignal, setCollapseSignal] = useState(0);

    // ── Edit helpers ─────────────────────────────────────────────────────────
    function startEdit(account: Account) {
        setEditing(account.id);
        setForm({
            code:         account.code,
            name:         account.name,
            naturaleza:   typeToNaturaleza(account.type),
            saldoInicial: String(account.saldoInicial ?? 0).replace('.', ','),
            isGroup:      account.isGroup,
        });
        setShowSuccessMsg(false);
    }

    function cancelEdit() {
        setEditing(null);
        setForm(EMPTY_FORM);
    }

    // ── Submit ───────────────────────────────────────────────────────────────
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

    // ── Delete ───────────────────────────────────────────────────────────────
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

    // ── Selector view ────────────────────────────────────────────────────────

    const renderSelectorView = () => (
        <>
            <PageHeader
                title="Cuentas"
                subtitle={
                    chartsLoading
                        ? 'Cargando planes…'
                        : charts.length === 0
                            ? 'Sin planes · empieza importando uno'
                            : `Selecciona uno de los ${charts.length} ${charts.length === 1 ? 'plan disponible' : 'planes disponibles'}`
                }
            />
            <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-[1200px] mx-auto flex flex-col gap-8">

                    {/* KPI strip */}
                    {!chartsLoading && charts.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <DashboardKpiCard
                                label="Planes disponibles"
                                value={charts.length}
                                sublabel={charts.length === 1 ? 'Un único plan en uso' : 'Estructuras importadas'}
                                color="primary"
                                loading={chartsLoading}
                                icon={Library}
                            />
                            <DashboardKpiCard
                                label="Cuentas totales"
                                value={totalAcrossPlans.toLocaleString('es-VE')}
                                sublabel="Sumadas entre todos los planes"
                                color="default"
                                loading={accountsLoading || chartsLoading}
                                icon={FolderTree}
                            />
                            <DashboardKpiCard
                                label="Plan más extenso"
                                value={largestChart ? largestChart.accountCount.toLocaleString('es-VE') : '—'}
                                sublabel={largestChart?.name ?? 'Sin planes aún'}
                                color="default"
                                loading={chartsLoading}
                                icon={Layers}
                            />
                        </div>
                    )}

                    {/* First-paint loading */}
                    {chartsLoading && charts.length === 0 && (
                        <div className="flex items-center justify-center py-20">
                            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-text-tertiary animate-pulse">
                                Cargando planes…
                            </span>
                        </div>
                    )}

                    {/* Empty state */}
                    {!chartsLoading && charts.length === 0 && (
                        <motion.section
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="relative overflow-hidden rounded-2xl border border-border-light bg-surface-1 px-8 py-14 shadow-sm"
                        >
                            <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-500/10 blur-3xl" />
                            <div aria-hidden="true" className="pointer-events-none absolute -left-12 -bottom-12 h-44 w-44 rounded-full bg-primary-500/5 blur-3xl" />

                            <div className="relative flex flex-col items-center text-center gap-5 max-w-[480px] mx-auto">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10 border border-primary-500/20 text-primary-500">
                                    <Library size={26} strokeWidth={2} />
                                </div>

                                <div className="flex flex-col gap-2">
                                    <h2 className="font-mono text-[16px] font-bold uppercase tracking-[0.12em] text-foreground">
                                        Necesitas un plan primero
                                    </h2>
                                    <p className="font-sans text-[14px] text-text-secondary leading-snug">
                                        Antes de gestionar cuentas, importa la estructura del plan contable de la empresa.
                                        Konta detecta los grupos raíz y propone la naturaleza Debe/Haber automáticamente.
                                    </p>
                                </div>

                                <BaseButton.Root
                                    as={Link}
                                    href="/accounting/charts"
                                    variant="primary"
                                    size="md"
                                    leftIcon={<Library size={14} strokeWidth={2.4} />}
                                >
                                    Ir a planes de cuentas
                                </BaseButton.Root>

                                <p className="font-sans text-[11px] text-text-tertiary inline-flex items-center gap-1.5">
                                    <Sparkles size={11} strokeWidth={2} className="text-primary-500" />
                                    Compatible con MEISTER y Profit Plus
                                </p>
                            </div>
                        </motion.section>
                    )}

                    {/* Plan grid */}
                    {!chartsLoading && charts.length > 0 && (
                        <div className="flex flex-col gap-4">
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    <h2 className="font-mono text-[14px] uppercase tracking-[0.14em] font-bold text-foreground">
                                        Planes disponibles
                                    </h2>
                                    <p className="font-sans text-[12px] text-text-tertiary">
                                        Elige el plan que deseas explorar y gestionar.
                                    </p>
                                </div>
                                <Link
                                    href="/accounting/charts"
                                    className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary hover:text-primary-500 transition-colors inline-flex items-center gap-1"
                                >
                                    Administrar planes
                                    <ChevronRight size={12} strokeWidth={2.4} />
                                </Link>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {charts.map((c, idx) => (
                                    <motion.button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setSelectedChartId(c.id)}
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.22, ease: 'easeOut', delay: Math.min(idx * 0.04, 0.24) }}
                                        className="group flex flex-col gap-4 p-5 bg-surface-1 border border-border-light hover:border-primary-500/40 hover:shadow-md rounded-2xl transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 text-left"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-start gap-3 min-w-0 flex-1">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-500">
                                                    <Library size={18} strokeWidth={2} />
                                                </div>
                                                <div className="flex flex-col gap-1 min-w-0">
                                                    <h3 className="font-mono text-[15px] font-bold text-foreground truncate">
                                                        {c.name}
                                                    </h3>
                                                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary">
                                                        {c.accountCount.toLocaleString('es-VE')} {c.accountCount === 1 ? 'cuenta' : 'cuentas'}
                                                    </span>
                                                </div>
                                            </div>
                                            <ChevronRight
                                                size={18}
                                                aria-hidden="true"
                                                className="shrink-0 text-text-tertiary group-hover:text-primary-500 transition-colors mt-1"
                                            />
                                        </div>

                                        <div className="flex items-center justify-between pt-3 border-t border-border-light/60">
                                            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary-500/80 group-hover:text-primary-500 transition-colors inline-flex items-center gap-1">
                                                Explorar cuentas
                                                <ChevronRight size={12} strokeWidth={2.4} />
                                            </span>
                                        </div>
                                    </motion.button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );

    // ── Detail view ──────────────────────────────────────────────────────────

    const renderDetailView = () => (
        <>
            <PageHeader
                title={selectedChart?.name ?? 'Plan'}
                subtitle={`Explorador de cuentas · ${detailMetrics.total} ${detailMetrics.total === 1 ? 'cuenta' : 'cuentas'}`}
            >
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onPress={() => { setSelectedChartId(null); cancelEdit(); }}
                    leftIcon={<ArrowLeft size={14} strokeWidth={2.2} />}
                >
                    Cambiar plan
                </BaseButton.Root>
            </PageHeader>

            <div className="flex-1 overflow-y-auto px-8 py-8">
                <div className="max-w-[1400px] mx-auto flex flex-col gap-6">

                    {/* KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <DashboardKpiCard
                            label="Cuentas totales"
                            value={detailMetrics.total.toLocaleString('es-VE')}
                            sublabel={`Profundidad ${detailMetrics.maxLevel || 1} ${detailMetrics.maxLevel === 1 ? 'nivel' : 'niveles'}`}
                            color="primary"
                            loading={accountsLoading}
                            icon={FolderTree}
                        />
                        <DashboardKpiCard
                            label="Detalle"
                            value={detailMetrics.detail.toLocaleString('es-VE')}
                            sublabel="Aceptan asientos"
                            color="default"
                            loading={accountsLoading}
                            icon={FileText}
                        />
                        <DashboardKpiCard
                            label="Grupos"
                            value={detailMetrics.group.toLocaleString('es-VE')}
                            sublabel="Carpetas de agrupación"
                            color="default"
                            loading={accountsLoading}
                            icon={Folder}
                        />
                        <DashboardKpiCard
                            label="Saldo inicial"
                            value={`Bs. ${fmtBs(detailMetrics.totalSaldo)}`}
                            sublabel="Sumado entre cuentas detalle"
                            color="default"
                            loading={accountsLoading}
                            icon={Wallet}
                        />
                    </div>

                    {/* Form + Tree */}
                    <div className="flex flex-col lg:flex-row gap-6 items-start">

                        {/* Form */}
                        <motion.section
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: 'easeOut' }}
                            className="w-full lg:w-[340px] shrink-0 lg:sticky lg:top-6 flex flex-col gap-4 p-5 border border-border-light rounded-2xl bg-surface-1 shadow-sm"
                            aria-label={editing ? 'Editar cuenta' : 'Nueva cuenta'}
                        >
                            <div className="flex items-center gap-3 pb-3 border-b border-border-light/60">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-500">
                                    {editing ? <Pencil size={15} strokeWidth={2} /> : <Plus size={16} strokeWidth={2.2} />}
                                </div>
                                <div className="flex flex-col">
                                    <h2 className="font-mono text-[12px] uppercase tracking-[0.14em] font-semibold text-foreground">
                                        {editing ? 'Editar cuenta' : 'Nueva cuenta'}
                                    </h2>
                                    <span className="font-sans text-[11px] text-text-tertiary">
                                        {editing ? 'Aplicar cambios al catálogo' : 'Anexar al plan seleccionado'}
                                    </span>
                                </div>
                            </div>

                            <form onSubmit={(e) => { void handleSubmit(e); }} className="flex flex-col gap-3">
                                <BaseInput.Field
                                    label="Código"
                                    isRequired
                                    placeholder="1.1.01.001"
                                    value={form.code}
                                    onValueChange={(v) => setForm(f => ({ ...f, code: v }))}
                                />

                                <BaseInput.Field
                                    label="Descripción"
                                    isRequired
                                    placeholder="Banco Mercantil"
                                    value={form.name}
                                    onValueChange={(v) => setForm(f => ({ ...f, name: v }))}
                                />

                                {!form.isGroup && (
                                    <>
                                        <div className="flex flex-col">
                                            <span className="font-mono text-[12px] tracking-[0.12em] uppercase mb-1.5 text-neutral-500 dark:text-neutral-400">
                                                Naturaleza
                                            </span>
                                            <NaturalezaToggle
                                                value={form.naturaleza}
                                                onChange={(n) => setForm(f => ({ ...f, naturaleza: n }))}
                                            />
                                        </div>

                                        <BaseInput.Field
                                            label="Saldo inicial"
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0,00"
                                            value={form.saldoInicial}
                                            onValueChange={(v) => setForm(f => ({ ...f, saldoInicial: v }))}
                                            inputClassName="text-right"
                                            prefix="Bs."
                                        />
                                    </>
                                )}

                                {/* Carpeta toggle */}
                                <button
                                    type="button"
                                    onClick={() => setForm(f => ({
                                        ...f,
                                        isGroup:      !f.isGroup,
                                        saldoInicial: !f.isGroup ? '' : f.saldoInicial,
                                    }))}
                                    aria-pressed={form.isGroup}
                                    className={[
                                        'flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors',
                                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                                        form.isGroup
                                            ? 'border-primary-500/40 bg-primary-500/5 text-foreground'
                                            : 'border-border-light bg-surface-1 text-text-secondary hover:bg-surface-2/50',
                                    ].join(' ')}
                                >
                                    <span className="flex items-center gap-2">
                                        <Folder
                                            size={13}
                                            strokeWidth={2}
                                            className={form.isGroup ? 'text-primary-500' : 'text-text-tertiary'}
                                        />
                                        <span className="font-mono text-[12px]">Carpeta de agrupación</span>
                                    </span>
                                    <span className={[
                                        'inline-flex items-center w-9 h-5 rounded-full transition-colors',
                                        form.isGroup ? 'bg-primary-500' : 'bg-surface-2 border border-border-light',
                                    ].join(' ')}>
                                        <span className={[
                                            'inline-block w-4 h-4 rounded-full bg-white shadow-sm transition-transform',
                                            form.isGroup ? 'translate-x-[18px]' : 'translate-x-[2px]',
                                        ].join(' ')} />
                                    </span>
                                </button>

                                {showSuccessMsg && (
                                    <p className="font-mono text-[11px] text-text-success mt-1 flex items-center gap-1.5 bg-text-success/10 border border-text-success/20 p-2 rounded-lg">
                                        <Check size={12} strokeWidth={2.4} />
                                        Cuenta añadida
                                    </p>
                                )}

                                <div className="flex gap-2 pt-2 mt-1">
                                    <BaseButton.Root type="submit" variant="primary" size="sm" loading={saving} className="flex-1">
                                        {editing ? 'Guardar cambios' : 'Anexar cuenta'}
                                    </BaseButton.Root>
                                    {editing && (
                                        <BaseButton.Root type="button" variant="ghost" size="sm" onPress={cancelEdit}>
                                            Cancelar
                                        </BaseButton.Root>
                                    )}
                                </div>
                            </form>
                        </motion.section>

                        {/* Tree */}
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
                            className="flex-1 w-full bg-surface-1 border border-border-light rounded-2xl overflow-hidden shadow-sm flex flex-col min-h-[60vh]"
                        >
                            <div className="px-4 py-3 border-b border-border-light bg-surface-2/40 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary font-semibold whitespace-nowrap">
                                        Árbol jerárquico ({chartAccounts.length})
                                    </span>
                                    {accountsLoading && (
                                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-primary-500 animate-pulse">
                                            Refrescando…
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 flex-1 sm:max-w-md justify-end">
                                    <div className="relative flex-1 max-w-[280px]">
                                        <Search
                                            size={12}
                                            strokeWidth={2.2}
                                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
                                            aria-hidden="true"
                                        />
                                        <input
                                            type="text"
                                            value={filter}
                                            onChange={(e) => setFilter(e.target.value)}
                                            placeholder="Buscar código o nombre…"
                                            aria-label="Buscar en el árbol"
                                            className="w-full h-8 pl-7 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[12px] text-foreground placeholder:text-text-tertiary placeholder:font-sans hover:border-border-medium focus:border-primary-500 transition-colors"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setExpandSignal(s => s + 1)}
                                        className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-surface-2 whitespace-nowrap"
                                    >
                                        Expandir
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCollapseSignal(s => s + 1)}
                                        className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-surface-2 whitespace-nowrap"
                                    >
                                        Colapsar
                                    </button>
                                </div>
                            </div>

                            <div className="p-3 overflow-y-auto w-full flex-1">
                                {chartAccounts.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-60 gap-3 text-center px-6">
                                        <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-text-tertiary">
                                            <FolderTree size={22} strokeWidth={1.8} />
                                        </div>
                                        <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-text-secondary">
                                            Plan vacío
                                        </span>
                                        <span className="font-sans text-[12px] text-text-tertiary max-w-[300px]">
                                            Añade la primera cuenta usando el formulario de la izquierda.
                                        </span>
                                    </div>
                                ) : visibleCodes && visibleCodes.size === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-40 gap-2 text-center px-6">
                                        <Search size={18} strokeWidth={1.8} className="text-text-tertiary" />
                                        <span className="font-sans text-[12px] text-text-tertiary">
                                            Ninguna cuenta coincide con &ldquo;{filter}&rdquo;.
                                        </span>
                                    </div>
                                ) : (
                                    accountTree
                                        .filter(n => !visibleCodes || visibleCodes.has(n.account.code))
                                        .map(rootNode => (
                                            <AccountTreeNode
                                                key={rootNode.account.id}
                                                node={rootNode}
                                                level={0}
                                                onSelectEdit={startEdit}
                                                onDeleteRequest={(acc) => setDeleteTarget(acc)}
                                                expandSignal={expandSignal}
                                                collapseSignal={collapseSignal}
                                                forceVisible={visibleCodes}
                                                activeId={editing}
                                            />
                                        ))
                                )}
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>
        </>
    );

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full bg-surface-2 font-mono">
                {selectedChartId ? renderDetailView() : renderSelectorView()}

                {/* Delete confirmation modal */}
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
                                    <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                        Eliminar cuenta
                                    </h2>
                                    <BaseButton.Icon variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
                                        <X size={14} />
                                    </BaseButton.Icon>
                                </div>

                                <div className="p-6">
                                    <p className="font-sans text-[13px] text-text-secondary leading-relaxed">
                                        ¿Eliminar la cuenta{' '}
                                        <span className="font-mono font-semibold text-foreground">
                                            {deleteTarget?.code} — {deleteTarget?.name}
                                        </span>
                                        ? Esta acción no se puede deshacer.
                                    </p>
                                </div>

                                <div className="px-6 py-4 border-t border-border-light bg-surface-2/30 flex justify-end gap-3">
                                    <BaseButton.Root
                                        variant="ghost"
                                        size="sm"
                                        onPress={() => setDeleteTarget(null)}
                                        isDisabled={deleting}
                                    >
                                        Cancelar
                                    </BaseButton.Root>
                                    <BaseButton.Root
                                        variant="danger"
                                        size="sm"
                                        loading={deleting}
                                        leftIcon={<Trash2 size={13} strokeWidth={2.2} />}
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
