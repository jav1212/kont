"use client";

// Plan de Cuentas management page.
// Lists named charts for the selected company.
// Supports importing from a TXT/CSV file (2-step: upload → confirm naturaleza).
// Plan limits are enforced server-side; errors surface as inline messages.

import { useId, useRef, useState, useMemo }           from 'react';
import { AnimatePresence, motion }                     from 'framer-motion';
import {
    X, Upload, Trash2, Download, ArrowLeft, Check,
    Library, FolderTree, Layers, Pencil, ChevronRight, FileText, Sparkles,
} from 'lucide-react';
import { PageHeader }                            from '@/src/shared/frontend/components/page-header';
import { BaseButton }                            from '@/src/shared/frontend/components/base-button';
import { BaseInput }                             from '@/src/shared/frontend/components/base-input';
import { DashboardKpiCard }                      from '@/src/shared/frontend/components/dashboard-kpi-card';
import { ContextLink as Link }                   from '@/src/shared/frontend/components/context-link';
import { AccountingAccessGuard }                 from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { useCompany }                            from '@/src/modules/companies/frontend/hooks/use-companies';
import { useCharts }                             from '@/src/modules/accounting/frontend/hooks/use-charts';
import { useAccounts }                           from '@/src/modules/accounting/frontend/hooks/use-accounts';
import { notify }                                from '@/src/shared/frontend/notify';
import { parseChartFile, detectRoots }           from '@/src/modules/accounting/frontend/utils/chart-import-parser';
import type { RootEntry, Naturaleza }            from '@/src/modules/accounting/frontend/utils/chart-import-parser';
import type { AccountChart }                     from '@/src/modules/accounting/backend/domain/account-chart';
import type { Account }                          from '@/src/modules/accounting/backend/domain/account';

// ── Date formatting ───────────────────────────────────────────────────────────

const MONTHS_SHORT = [
    'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const;

function fmtShortDate(iso: string): string {
    const [y, m, d] = iso.split('T')[0].split('-');
    if (!y || !m || !d) return iso;
    const month = MONTHS_SHORT[(Number(m) - 1) | 0] ?? '';
    return `${parseInt(d, 10)} ${month} ${y}`;
}

// ── Per-chart metadata derived from the accounts list ────────────────────────

interface ChartMetrics {
    /** Number of accounts where parentCode === null (root groups). */
    roots:   number;
    /** Maximum hierarchical depth observed (levels in the longest code). */
    depth:   number;
}

function computeChartMetrics(accounts: Account[]): ChartMetrics {
    let roots = 0;
    let depth = 0;
    for (const a of accounts) {
        if (a.parentCode === null) roots++;
        const lvl = a.code.split('.').length;
        if (lvl > depth) depth = lvl;
    }
    return { roots, depth };
}

// ── Example file ──────────────────────────────────────────────────────────────

const EXAMPLE_CONTENT = [
    '1,"  ACTIVO",G,1,NO,NO,NO,M,O',
    '1.1,"     ACTIVO CIRCULANTE",G,2,NO,NO,NO,M,C',
    '1.1.01,"        Caja",M,3,NO,NO,NO,M,O',
    '1.1.02,"        Bancos",M,3,NO,NO,NO,M,O',
    '2,"  PASIVO",G,1,NO,NO,NO,M,C',
    '2.1,"     PASIVO CIRCULANTE",G,2,NO,NO,NO,M,C',
    '2.1.01,"        Cuentas por Pagar",M,3,NO,NO,NO,M,C',
    '3,"  CAPITAL",G,1,NO,NO,NO,M,C',
    '3.1.01,"     Capital Social",M,2,NO,NO,NO,M,C',
    '4,"  INGRESOS",G,1,NO,NO,NO,M,C',
    '4.1.01,"     Ventas",M,2,NO,NO,NO,M,C',
    '5,"  COSTOS Y GASTOS",G,1,NO,NO,NO,M,O',
    '5.1.01,"     Costo de Ventas",M,2,NO,NO,NO,M,O',
].join('\r\n');

function downloadExample() {
    const blob = new Blob([EXAMPLE_CONTENT], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'ejemplo-plan-de-cuentas.txt';
    a.click();
    URL.revokeObjectURL(url);
}

// ── Constants ─────────────────────────────────────────────────────────────────

const labelCls = "font-mono text-[11px] uppercase tracking-[0.18em] text-text-tertiary block mb-1.5";

// ── Naturaleza toggle ─────────────────────────────────────────────────────────

function NaturalezaToggle({
    value,
    onChange,
}: {
    value: Naturaleza;
    onChange: (n: Naturaleza) => void;
}) {
    return (
        <div className="flex rounded-lg border border-border-light overflow-hidden shrink-0">
            <button
                type="button"
                onClick={() => onChange('debe')}
                className={[
                    'px-3 py-1 font-mono text-[11px] font-semibold transition-colors',
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
                    'px-3 py-1 font-mono text-[11px] font-semibold transition-colors border-l border-border-light',
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

// ── Component ─────────────────────────────────────────────────────────────────

type ModalStep = 'upload' | 'roots';

export default function ChartsPage() {
    const modalId        = useId();
    const { companyId }  = useCompany();
    const { data: rawData, loading, deleteChart, renameChart, importChart } = useCharts(companyId);
    const { data: accounts } = useAccounts(companyId);

    // Import modal state
    const [importOpen,    setImportOpen]    = useState(false);
    const [modalStep,     setModalStep]     = useState<ModalStep>('upload');
    const [importName,    setImportName]    = useState('');
    const [importFile,    setImportFile]    = useState<File | null>(null);
    const [importText,    setImportText]    = useState<string | null>(null);
    const [roots,         setRoots]         = useState<RootEntry[]>([]);
    const [naturalezaMap, setNaturalezaMap] = useState<Record<string, Naturaleza>>({});
    const [totalAccounts, setTotalAccounts] = useState(0);
    const [skippedLines,  setSkippedLines]  = useState(0);
    const [importing,     setImporting]     = useState(false);
    const fileInputRef                      = useRef<HTMLInputElement>(null);

    // Inline rename state (per-card)
    const [editingId,   setEditingId]   = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [renaming,    setRenaming]    = useState(false);

    // Delete modal state
    const [deleteTarget, setDeleteTarget] = useState<AccountChart | null>(null);
    const [deleting,     setDeleting]     = useState(false);

    // ── Derived metrics ───────────────────────────────────────────────────────

    // Group accounts by chartId once, then compute per-chart metrics on lookup.
    const accountsByChart = useMemo(() => {
        const map = new Map<string, Account[]>();
        for (const a of accounts) {
            if (!a.chartId) continue;
            const list = map.get(a.chartId);
            if (list) list.push(a);
            else map.set(a.chartId, [a]);
        }
        return map;
    }, [accounts]);

    const chartMetricsById = useMemo(() => {
        const m = new Map<string, ChartMetrics>();
        for (const [chartId, list] of accountsByChart.entries()) {
            m.set(chartId, computeChartMetrics(list));
        }
        return m;
    }, [accountsByChart]);

    // KPI strip metrics
    const totalAccountsAcrossPlans = useMemo(
        () => rawData.reduce((sum, c) => sum + (c.accountCount ?? 0), 0),
        [rawData],
    );
    const largestChart = useMemo(() => {
        if (rawData.length === 0) return null;
        return rawData.reduce((max, c) => (c.accountCount > (max?.accountCount ?? -1) ? c : max), rawData[0]);
    }, [rawData]);

    // ── Import handlers ───────────────────────────────────────────────────────

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setImportFile(file);
        setImportText(null);
        setRoots([]);
        setNaturalezaMap({});

        if (!file) return;

        // Read with latin1 — Venezuelan accounting exports are often ISO-8859-1.
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setImportText(text);

            const detected = detectRoots(text);
            if (detected.length === 0) {
                notify.error('No se encontraron cuentas en el archivo. Verifica el formato.');
                return;
            }

            // Pre-fill naturaleza map from detected roots.
            const map: Record<string, Naturaleza> = {};
            for (const r of detected) map[r.root] = r.naturaleza;

            const { accounts, skipped } = parseChartFile(text, map);

            setRoots(detected);
            setNaturalezaMap(map);
            setTotalAccounts(accounts.length);
            setSkippedLines(skipped);
            setModalStep('roots');
        };
        reader.readAsText(file, 'latin1');
    }

    function setRootNaturaleza(root: string, value: Naturaleza) {
        setNaturalezaMap(prev => ({ ...prev, [root]: value }));
    }

    function openImport() {
        setImportName('');
        setImportFile(null);
        setImportText(null);
        setRoots([]);
        setNaturalezaMap({});
        setTotalAccounts(0);
        setSkippedLines(0);
        setModalStep('upload');
        setImportOpen(true);
    }

    function closeImport() {
        setImportOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    function goBackToUpload() {
        setModalStep('upload');
        setImportFile(null);
        setImportText(null);
        setRoots([]);
        setNaturalezaMap({});
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function handleImport() {
        if (!importText || !importFile) return;
        setImporting(true);
        try {
            const { accounts } = parseChartFile(importText, naturalezaMap);
            const chartName    = importName.trim() || importFile.name.replace(/\.[^.]+$/, '');
            const ok           = await importChart(chartName, accounts);
            if (ok) closeImport();
        } catch {
            notify.error('No se pudo leer el archivo. Inténtalo de nuevo o verifica que no esté dañado.');
        } finally {
            setImporting(false);
        }
    }

    // ── Rename handlers ───────────────────────────────────────────────────────

    function startEdit(item: AccountChart) {
        setEditingId(item.id);
        setEditingName(item.name);
    }

    function cancelEdit() {
        setEditingId(null);
        setEditingName('');
    }

    async function confirmRename(item: AccountChart) {
        const trimmed = editingName.trim();
        if (!trimmed || trimmed === item.name) { cancelEdit(); return; }
        setRenaming(true);
        const ok = await renameChart(item.id, item.companyId, trimmed);
        if (ok) { setEditingId(null); setEditingName(''); }
        setRenaming(false);
    }

    // ── Delete handlers ───────────────────────────────────────────────────────

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        const ok = await deleteChart(deleteTarget.id);
        if (ok) setDeleteTarget(null);
        setDeleting(false);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const isEmpty = !loading && rawData.length === 0;

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full bg-surface-2 font-mono">
                <PageHeader title="Planes de Cuentas" subtitle="Importación y gestión de estructuras de cuentas">
                    {!isEmpty && (
                        <BaseButton.Root
                            variant="primary"
                            size="sm"
                            onPress={openImport}
                            leftIcon={<Upload size={14} strokeWidth={2.4} />}
                        >
                            Importar plan
                        </BaseButton.Root>
                    )}
                </PageHeader>

                <div className="flex-1 overflow-y-auto px-8 py-8">
                    <div className="max-w-[1200px] mx-auto flex flex-col gap-8">

                        {/* ── KPI strip — hidden during empty state ─────── */}
                        {!isEmpty && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <DashboardKpiCard
                                    label="Planes activos"
                                    value={loading ? '—' : rawData.length}
                                    sublabel={
                                        loading
                                            ? 'Cargando…'
                                            : rawData.length === 1
                                                ? 'Un único plan en uso'
                                                : `${rawData.length} estructuras importadas`
                                    }
                                    color="primary"
                                    loading={loading}
                                    icon={Library}
                                />
                                <DashboardKpiCard
                                    label="Cuentas totales"
                                    value={loading ? '—' : totalAccountsAcrossPlans.toLocaleString('es-VE')}
                                    sublabel="Sumadas entre todos los planes"
                                    color="default"
                                    loading={loading}
                                    icon={FolderTree}
                                />
                                <DashboardKpiCard
                                    label="Plan más extenso"
                                    value={
                                        loading || !largestChart
                                            ? '—'
                                            : largestChart.accountCount.toLocaleString('es-VE')
                                    }
                                    sublabel={largestChart ? largestChart.name : 'Sin planes aún'}
                                    color="default"
                                    loading={loading}
                                    icon={Layers}
                                />
                            </div>
                        )}

                        {/* ── Loading state (first paint, no data yet) ─── */}
                        {loading && rawData.length === 0 && (
                            <div className="flex items-center justify-center py-20">
                                <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-text-tertiary animate-pulse">
                                    Cargando planes…
                                </span>
                            </div>
                        )}

                        {/* ── Empty state ───────────────────────────────── */}
                        {isEmpty && (
                            <motion.section
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                className="relative overflow-hidden rounded-2xl border border-border-light bg-surface-1 px-8 py-14 shadow-sm"
                            >
                                {/* Ambient orange bloom — sparingly, signature glow */}
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary-500/10 blur-3xl"
                                />
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute -left-12 -bottom-12 h-44 w-44 rounded-full bg-primary-500/5 blur-3xl"
                                />

                                <div className="relative flex flex-col items-center text-center gap-5 max-w-[480px] mx-auto">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10 border border-primary-500/20 text-primary-500">
                                        <Library size={26} strokeWidth={2} />
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <h2 className="font-mono text-[16px] font-bold uppercase tracking-[0.12em] text-foreground">
                                            Importa tu primer plan
                                        </h2>
                                        <p className="font-sans text-[14px] text-[var(--text-secondary)] leading-snug">
                                            Carga un archivo TXT o CSV con la estructura de cuentas de la empresa.
                                            Konta detecta los grupos raíz y propone la naturaleza Debe/Haber automáticamente.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                                        <BaseButton.Root
                                            variant="primary"
                                            size="md"
                                            onPress={openImport}
                                            leftIcon={<Upload size={14} strokeWidth={2.4} />}
                                        >
                                            Importar plan
                                        </BaseButton.Root>
                                        <BaseButton.Root
                                            variant="secondary"
                                            size="md"
                                            onPress={downloadExample}
                                            leftIcon={<Download size={14} strokeWidth={2.2} />}
                                        >
                                            Descargar ejemplo
                                        </BaseButton.Root>
                                    </div>

                                    <p className="font-sans text-[11px] text-[var(--text-tertiary)] pt-2 inline-flex items-center gap-1.5">
                                        <Sparkles size={11} strokeWidth={2} className="text-primary-500" />
                                        Compatible con exportes de MEISTER y Profit Plus
                                    </p>
                                </div>
                            </motion.section>
                        )}

                        {/* ── Plan cards grid ───────────────────────────── */}
                        {!isEmpty && rawData.length > 0 && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                {rawData.map((chart, idx) => (
                                    <PlanCard
                                        key={chart.id}
                                        chart={chart}
                                        metrics={chartMetricsById.get(chart.id)}
                                        index={idx}
                                        editing={editingId === chart.id}
                                        editingName={editingName}
                                        renaming={renaming}
                                        onStartEdit={() => startEdit(chart)}
                                        onCancelEdit={cancelEdit}
                                        onChangeName={setEditingName}
                                        onConfirmRename={() => { void confirmRename(chart); }}
                                        onDelete={() => setDeleteTarget(chart)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Import modal ──────────────────────────────────────────── */}
            <AnimatePresence>
                {importOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeImport}
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        />
                        <motion.div
                            key={modalStep}
                            initial={{ opacity: 0, scale: 0.97, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 8 }}
                            transition={{ duration: 0.18 }}
                            className="relative w-full max-w-lg bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                        >
                            {/* ── Step 1: Upload ── */}
                            {modalStep === 'upload' && (
                                <>
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-2/30 shrink-0">
                                        <div>
                                            <h2 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                                Importar Plan de Cuentas
                                            </h2>
                                            <p className="text-[10px] text-text-tertiary mt-0.5 uppercase tracking-wider">
                                                Paso 1 de 2 — Selecciona el archivo
                                            </p>
                                        </div>
                                        <BaseButton.Icon variant="ghost" size="sm" onClick={closeImport}>
                                            <X size={14} />
                                        </BaseButton.Icon>
                                    </div>

                                    <div className="p-6 space-y-5 overflow-y-auto">
                                        <BaseInput.Field
                                            label="Nombre del plan (opcional)"
                                            type="text"
                                            placeholder="Nombre del archivo por defecto"
                                            value={importName}
                                            onValueChange={setImportName}
                                        />

                                        <div className="flex flex-col gap-2">
                                            <label htmlFor={`${modalId}-file`} className={labelCls}>
                                                Archivo TXT / CSV
                                            </label>
                                            <input
                                                id={`${modalId}-file`}
                                                ref={fileInputRef}
                                                type="file"
                                                accept=".txt,.csv"
                                                onChange={handleFileChange}
                                                className="block w-full font-mono text-[12px] text-text-secondary file:mr-4 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:font-mono file:text-[11px] file:font-semibold file:uppercase file:tracking-[0.16em] file:bg-surface-2 file:text-foreground hover:file:bg-border-light/50 transition-all file:cursor-pointer p-1.5 rounded-xl border border-dashed border-border-light hover:border-border-medium bg-surface-1/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                                            />

                                            {/* Format hint */}
                                            <div className="rounded-xl border border-border-light bg-surface-2/60 overflow-hidden">
                                                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-light bg-surface-2">
                                                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                                                        Formato MEISTER / Profit
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={downloadExample}
                                                        className="flex items-center gap-1 font-mono text-[10px] text-primary-500 hover:text-primary-400 transition-colors focus-visible:outline-none focus-visible:underline"
                                                    >
                                                        <Download size={10} />
                                                        Descargar ejemplo
                                                    </button>
                                                </div>
                                                <pre className="px-3 py-2 font-mono text-[10px] leading-[1.7] text-text-secondary overflow-x-auto whitespace-pre select-all">{
                                                    '1,"  ACTIVO",G,1,NO,NO,NO,M,O\n' +
                                                    '1.1.01,"     Caja",M,3,NO,NO,NO,M,O\n' +
                                                    '2,"  PASIVO",G,1,NO,NO,NO,M,C\n' +
                                                    '2.1.01,"     Cuentas por Pagar",M,3,NO,NO,NO,M,C'
                                                }</pre>
                                                <div className="px-3 py-1.5 border-t border-border-light bg-surface-2/40 flex gap-4">
                                                    <span className="font-mono text-[9px] text-text-tertiary"><span className="text-foreground font-semibold">G</span> = Agrupación</span>
                                                    <span className="font-mono text-[9px] text-text-tertiary"><span className="text-foreground font-semibold">M</span> = Movimiento</span>
                                                    <span className="font-mono text-[9px] text-text-tertiary"><span className="text-foreground font-semibold">Nivel</span> = informativo</span>
                                                </div>
                                            </div>
                                        </div>

                                    </div>

                                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light bg-surface-2/30 shrink-0">
                                        <BaseButton.Root variant="secondary" size="sm" onClick={closeImport}>
                                            Cancelar
                                        </BaseButton.Root>
                                    </div>
                                </>
                            )}

                            {/* ── Step 2: Confirm naturaleza ── */}
                            {modalStep === 'roots' && (
                                <>
                                    <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-2/30 shrink-0">
                                        <div className="flex items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={goBackToUpload}
                                                className="text-text-tertiary hover:text-foreground transition-colors"
                                                aria-label="Volver"
                                            >
                                                <ArrowLeft size={16} />
                                            </button>
                                            <div>
                                                <h2 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                                    Confirma la Naturaleza
                                                </h2>
                                                <p className="text-[10px] text-text-tertiary mt-0.5 uppercase tracking-wider">
                                                    Paso 2 de 2 — Verifica Debe / Haber por grupo raíz
                                                </p>
                                            </div>
                                        </div>
                                        <BaseButton.Icon variant="ghost" size="sm" onClick={closeImport}>
                                            <X size={14} />
                                        </BaseButton.Icon>
                                    </div>

                                    <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20 shrink-0">
                                        <p className="font-mono text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                                            Se detectaron <span className="font-semibold">{roots.length} grupos raíz</span> con un total de <span className="font-semibold">{totalAccounts.toLocaleString('es-VE')} cuentas</span>.
                                            El sistema pre-llenó la naturaleza.
                                            Corrígela si tu plan usa una codificación diferente.
                                        </p>
                                    </div>

                                    <div className="overflow-y-auto flex-1">
                                        <div className="divide-y divide-border-light">
                                            {roots.map((r) => (
                                                <div key={r.root} className="flex items-center gap-4 px-6 py-3.5 hover:bg-surface-2/40 transition-colors">
                                                    {/* Root badge */}
                                                    <div className="w-10 h-10 shrink-0 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center">
                                                        <span className="font-mono text-[13px] font-bold text-foreground">{r.root}</span>
                                                    </div>

                                                    {/* Description */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-mono text-[12px] font-semibold text-foreground truncate">
                                                            {r.sample}
                                                        </p>
                                                        <p className="font-mono text-[10px] text-text-tertiary mt-0.5">
                                                            {r.count.toLocaleString('es-VE')} {r.count === 1 ? 'cuenta' : 'cuentas'}
                                                        </p>
                                                    </div>

                                                    {/* Toggle */}
                                                    <NaturalezaToggle
                                                        value={naturalezaMap[r.root] ?? r.naturaleza}
                                                        onChange={(n) => setRootNaturaleza(r.root, n)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {skippedLines > 0 && (
                                        <div className="px-6 py-2 border-t border-border-light bg-surface-2/20 shrink-0">
                                            <p className="font-mono text-[10px] text-text-tertiary">
                                                {skippedLines} línea(s) omitida(s) por formato inválido
                                            </p>
                                        </div>
                                    )}


                                    <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border-light bg-surface-2/30 shrink-0">
                                        <span className="font-mono text-[11px] text-text-tertiary">
                                            {importFile?.name}
                                        </span>
                                        <div className="flex items-center gap-3">
                                            <BaseButton.Root
                                                variant="secondary"
                                                size="sm"
                                                onClick={closeImport}
                                                isDisabled={importing}
                                            >
                                                Cancelar
                                            </BaseButton.Root>
                                            <BaseButton.Root
                                                variant="primary"
                                                size="sm"
                                                loading={importing}
                                                isDisabled={importing}
                                                onClick={() => { void handleImport(); }}
                                                leftIcon={<Upload size={14} />}
                                            >
                                                Importar {totalAccounts.toLocaleString('es-VE')} cuentas
                                            </BaseButton.Root>
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Delete confirmation modal ─────────────────────────────── */}
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
                                    Eliminar plan
                                </h2>
                                <BaseButton.Icon variant="ghost" size="sm" onClick={() => { setDeleteTarget(null); }}>
                                    <X size={14} />
                                </BaseButton.Icon>
                            </div>

                            <div className="p-6">
                                <p className="font-mono text-[13px] text-text-secondary leading-relaxed">
                                    ¿Eliminar el plan <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
                                    <br /><br />
                                    Las cuentas permanecerán pero quedarán sin plan asignado.{' '}
                                    Esta acción no se puede deshacer.
                                </p>
                            </div>

                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light bg-surface-2/30">
                                <BaseButton.Root
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => { setDeleteTarget(null); }}
                                    isDisabled={deleting}
                                >
                                    Cancelar
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="danger"
                                    size="sm"
                                    loading={deleting}
                                    onClick={() => { void confirmDelete(); }}
                                    leftIcon={<Trash2 size={14} />}
                                >
                                    Eliminar
                                </BaseButton.Root>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </AccountingAccessGuard>
    );
}

// ── Plan card ─────────────────────────────────────────────────────────────────

interface PlanCardProps {
    chart:           AccountChart;
    metrics:         ChartMetrics | undefined;
    index:           number;
    editing:         boolean;
    editingName:     string;
    renaming:        boolean;
    onStartEdit:     () => void;
    onCancelEdit:    () => void;
    onChangeName:    (v: string) => void;
    onConfirmRename: () => void;
    onDelete:        () => void;
}

function PlanCard({
    chart, metrics, index,
    editing, editingName, renaming,
    onStartEdit, onCancelEdit, onChangeName, onConfirmRename, onDelete,
}: PlanCardProps) {
    // Stagger the entrance subtly so the grid feels composed, not popcorn.
    const enterDelay = Math.min(index * 0.04, 0.24);

    const cardClasses = [
        'group relative flex flex-col gap-4 p-5 rounded-2xl border bg-surface-1 shadow-sm',
        'transition-colors duration-150',
        editing
            ? 'border-primary-500/60 ring-2 ring-primary-500/10'
            : 'border-border-light hover:border-primary-500/40 hover:shadow-md',
    ].join(' ');

    const accountCount = chart.accountCount ?? 0;
    const roots        = metrics?.roots ?? 0;
    const depth        = metrics?.depth ?? 0;

    const Header = (
        <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-500">
                    <Library size={18} strokeWidth={2} />
                </div>

                {editing ? (
                    <div
                        className="flex flex-col gap-2 min-w-0 flex-1"
                        // Prevent the card-link from intercepting input events while editing.
                        onClick={(e) => e.stopPropagation()}
                    >
                        <BaseInput.Field
                            autoFocus
                            type="text"
                            value={editingName}
                            onValueChange={onChangeName}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter')  { onConfirmRename(); }
                                if (e.key === 'Escape') { onCancelEdit(); }
                            }}
                            isDisabled={renaming}
                        />
                        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-tertiary">
                            Enter para guardar · Esc para cancelar
                        </span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <h3 className="font-mono text-[15px] font-bold text-foreground truncate">
                            {chart.name}
                        </h3>
                        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-tertiary">
                            {accountCount.toLocaleString('es-VE')} {accountCount === 1 ? 'cuenta' : 'cuentas'}
                        </span>
                    </div>
                )}
            </div>

            {!editing && (
                <ChevronRight
                    size={18}
                    strokeWidth={2}
                    aria-hidden="true"
                    className="shrink-0 text-text-tertiary group-hover:text-primary-500 transition-colors mt-1"
                />
            )}
        </div>
    );

    const Metadata = (
        <div className="flex flex-wrap items-center gap-2">
            <MetaChip icon={FolderTree} label={`${roots} ${roots === 1 ? 'raíz' : 'raíces'}`} />
            <MetaChip icon={Layers} label={`${depth || 1} ${depth === 1 ? 'nivel' : 'niveles'}`} />
            <MetaChip icon={FileText} label={`Act. ${fmtShortDate(chart.updatedAt)}`} />
        </div>
    );

    const Actions = (
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-light/60">
            {editing ? (
                <>
                    <BaseButton.Root
                        size="sm"
                        variant="ghost"
                        onPress={onCancelEdit}
                        isDisabled={renaming}
                    >
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        size="sm"
                        variant="primary"
                        onPress={onConfirmRename}
                        loading={renaming}
                        leftIcon={<Check size={13} strokeWidth={2.4} />}
                    >
                        Guardar
                    </BaseButton.Root>
                </>
            ) : (
                <>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-primary-500/80 group-hover:text-primary-500 transition-colors inline-flex items-center gap-1">
                        Abrir cuentas
                        <ChevronRight size={12} strokeWidth={2.4} />
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onStartEdit();
                            }}
                            aria-label={`Renombrar ${chart.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:text-foreground hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                        >
                            <Pencil size={13} strokeWidth={2} />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDelete();
                            }}
                            aria-label={`Eliminar ${chart.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary hover:text-[var(--text-error)] hover:bg-[var(--text-error)]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text-error)]/40"
                        >
                            <Trash2 size={13} strokeWidth={2} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );

    const inner = (
        <>
            {Header}
            {Metadata}
            {Actions}
        </>
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut', delay: enterDelay }}
        >
            {editing ? (
                <div className={cardClasses}>
                    {inner}
                </div>
            ) : (
                <Link
                    href={`/accounting/accounts?chart=${chart.id}`}
                    className={`${cardClasses} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2`}
                    aria-label={`Abrir cuentas del plan ${chart.name}`}
                >
                    {inner}
                </Link>
            )}
        </motion.div>
    );
}

// ── Metadata chip (mono uppercase + lucide icon) ─────────────────────────────

function MetaChip({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border border-border-light bg-surface-2/60 font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary">
            <Icon size={11} strokeWidth={2} />
            {label}
        </span>
    );
}
