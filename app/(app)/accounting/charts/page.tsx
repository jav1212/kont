"use client";

// Plan de Cuentas management page.
// Lists named charts for the selected company.
// Supports importing from a TXT/CSV file (2-step: upload → confirm naturaleza).
// Plan limits are enforced server-side; errors surface as inline messages.

import { useId, useRef, useState, useMemo }           from 'react';
import { AnimatePresence, motion }                     from 'framer-motion';
import { X, Upload, Trash2, Download, ArrowLeft, Pencil, Check } from 'lucide-react';
import { PageHeader }                            from '@/src/shared/frontend/components/page-header';
import { BaseButton }                            from '@/src/shared/frontend/components/base-button';
import { AccountingAccessGuard }                 from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { BaseTable }                             from '@/src/shared/frontend/components/base-table';
import { useCompany }                            from '@/src/modules/companies/frontend/hooks/use-companies';
import { useCharts }                             from '@/src/modules/accounting/frontend/hooks/use-charts';
import { parseChartFile, detectRoots }           from '@/src/modules/accounting/frontend/utils/chart-import-parser';
import type { RootEntry, Naturaleza }            from '@/src/modules/accounting/frontend/utils/chart-import-parser';
import type { AccountChart }                     from '@/src/modules/accounting/backend/domain/account-chart';

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

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    "placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-500/20",
].join(" ");

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
    const { data: rawData, loading, error, deleteChart, renameChart, importChart } = useCharts(companyId);

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
    const [importErr,     setImportErr]     = useState<string | null>(null);
    const fileInputRef                      = useRef<HTMLInputElement>(null);

    // Inline rename state
    const [editingId,   setEditingId]   = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [renaming,    setRenaming]    = useState(false);
    const [renameErr,   setRenameErr]   = useState<string | null>(null);

    // Force table rows to re-render by returning a new object reference
    // on every keystroke, while casting to avoid TypeScript errors.
    const tableData = useMemo(() => {
        return rawData.map(item => {
            if (item.id === editingId) {
                return { ...item, _updateTrigger: editingName } as AccountChart;
            }
            return item;
        });
    }, [rawData, editingId, editingName]);

    // Delete modal state
    const [deleteTarget, setDeleteTarget] = useState<AccountChart | null>(null);
    const [deleting,     setDeleting]     = useState(false);
    const [deleteErr,    setDeleteErr]    = useState<string | null>(null);

    // ── Import handlers ───────────────────────────────────────────────────────

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setImportFile(file);
        setImportText(null);
        setImportErr(null);
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
                setImportErr('No se encontraron cuentas en el archivo. Verifica el formato.');
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
        setImportErr(null);
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
        setImportErr(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function handleImport() {
        if (!importText || !importFile) return;
        setImporting(true);
        setImportErr(null);
        try {
            const { accounts } = parseChartFile(importText, naturalezaMap);
            const chartName    = importName.trim() || importFile.name.replace(/\.[^.]+$/, '');
            const err          = await importChart(chartName, accounts);
            if (err) { setImportErr(err); return; }
            closeImport();
        } catch {
            setImportErr('No se pudo leer el archivo. Inténtalo de nuevo o verifica que no esté dañado.');
        } finally {
            setImporting(false);
        }
    }

    // ── Rename handlers ───────────────────────────────────────────────────────

    function startEdit(item: AccountChart) {
        setEditingId(item.id);
        setEditingName(item.name);
        setRenameErr(null);
    }

    function cancelEdit() {
        setEditingId(null);
        setEditingName('');
        setRenameErr(null);
    }

    async function confirmRename(item: AccountChart) {
        const trimmed = editingName.trim();
        if (!trimmed || trimmed === item.name) { cancelEdit(); return; }
        setRenaming(true);
        setRenameErr(null);
        const err = await renameChart(item.id, item.companyId, trimmed);
        if (err) { setRenameErr(err); }
        else     { setEditingId(null); setEditingName(''); }
        setRenaming(false);
    }

    // ── Delete handlers ───────────────────────────────────────────────────────

    async function confirmDelete() {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteErr(null);
        const err = await deleteChart(deleteTarget.id);
        if (err) { setDeleteErr(err); }
        else     { setDeleteTarget(null); }
        setDeleting(false);
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <AccountingAccessGuard>
            <div className="flex flex-col min-h-full bg-surface-2 font-mono">
                <PageHeader title="Planes de Cuentas" subtitle="Importación y gestión de estructuras de cuentas">
                    <BaseButton.Root variant="primary" size="sm" onPress={openImport}>
                        Importar plan
                    </BaseButton.Root>
                </PageHeader>

                <div className="flex-1 overflow-y-auto p-8">
                    <div className="max-w-[1100px] mx-auto space-y-5">
                        <BaseTable.Render<AccountChart>
                            columns={[
                                {
                                    key: 'name',
                                    label: 'Nombre del Plan',
                                    render: (_value, item) => editingId === item.id ? (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <input
                                                autoFocus
                                                type="text"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter')  { void confirmRename(item); }
                                                    if (e.key === 'Escape') { cancelEdit(); }
                                                }}
                                                disabled={renaming}
                                                className="h-7 px-2 rounded-md border border-border-light bg-surface-1 font-mono text-[13px] text-foreground focus:border-primary-500/60 focus:ring-2 focus:ring-primary-500/20 outline-none transition-colors min-w-0 flex-1 disabled:opacity-50"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => { void confirmRename(item); }}
                                                disabled={renaming}
                                                className="shrink-0 text-primary-500 hover:text-primary-400 disabled:opacity-40 transition-opacity focus-visible:outline-none"
                                                aria-label="Guardar nombre"
                                            >
                                                <Check size={14} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={cancelEdit}
                                                disabled={renaming}
                                                className="shrink-0 text-text-tertiary hover:text-foreground disabled:opacity-40 transition-colors focus-visible:outline-none"
                                                aria-label="Cancelar"
                                            >
                                                <X size={14} />
                                            </button>
                                            {renameErr && (
                                                <span className="font-mono text-[11px] text-text-error shrink-0">{renameErr}</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-mono text-[13px] font-semibold text-foreground truncate">
                                                {item.name}
                                            </span>
                                        </div>
                                    ),
                                },
                                {
                                    key: 'accountCount',
                                    label: 'Cuentas',
                                    align: 'end',
                                    render: (value) => (
                                        <span className="font-mono text-[13px] text-text-tertiary tabular-nums">
                                            {Number(value).toLocaleString('es-VE')}
                                        </span>
                                    ),
                                },
                                {
                                    key: 'id',
                                    label: '',
                                    align: 'end',
                                    render: (_value, item) => (
                                        <div className="flex items-center justify-end gap-3">
                                            <button
                                                type="button"
                                                onClick={() => startEdit(item)}
                                                className="font-mono text-[12px] text-primary-500 hover:opacity-70 focus-visible:outline-none focus-visible:underline transition-opacity"
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
                            data={tableData}
                            keyExtractor={(item) => item.id}
                            isLoading={loading}
                            emptyContent={
                                <div className="flex flex-col items-center gap-2">
                                    <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-text-tertiary font-bold">
                                        Sin planes de cuentas
                                    </span>
                                    <span className="font-mono text-[11px] text-text-tertiary">
                                        Importa tu primer plan usando el botón de arriba.
                                    </span>
                                </div>
                            }
                        />
                        {error && (
                            <p className="font-mono text-[12px] text-[var(--text-error)]">{error}</p>
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
                                        <div className="flex flex-col">
                                            <label htmlFor={`${modalId}-name`} className={labelCls}>
                                                Nombre del plan
                                                <span className="ml-1 normal-case tracking-normal text-text-tertiary opacity-70">(opcional)</span>
                                            </label>
                                            <input
                                                id={`${modalId}-name`}
                                                type="text"
                                                placeholder="Nombre del archivo por defecto"
                                                value={importName}
                                                onChange={(e) => setImportName(e.target.value)}
                                                className={fieldCls}
                                            />
                                        </div>

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

                                        {importErr && (
                                            <div className="p-3 rounded-lg bg-red-50 border border-red-100 dark:bg-red-500/10 dark:border-red-500/20">
                                                <p className="text-[11px] text-red-600 flex items-center gap-1.5 font-mono"><X size={10} /> {importErr}</p>
                                            </div>
                                        )}
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

                                    {importErr && (
                                        <div className="px-6 py-3 border-t border-border-light shrink-0">
                                            <div className="p-3 rounded-lg bg-red-50 border border-red-100 dark:bg-red-500/10 dark:border-red-500/20">
                                                <p className="text-[11px] text-red-600 flex items-center gap-1.5 font-mono"><X size={10} /> {importErr}</p>
                                            </div>
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
                            onClick={() => { setDeleteTarget(null); setDeleteErr(null); }}
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
                                <BaseButton.Icon variant="ghost" size="sm" onClick={() => { setDeleteTarget(null); setDeleteErr(null); }}>
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
                                {deleteErr && (
                                    <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-100 dark:bg-red-500/10 dark:border-red-500/20">
                                        <p className="text-[10px] text-red-600 flex items-center gap-1.5 font-mono"><X size={10} /> {deleteErr}</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light bg-surface-2/30">
                                <BaseButton.Root
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => { setDeleteTarget(null); setDeleteErr(null); }}
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
