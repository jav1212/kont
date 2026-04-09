"use client";

// Plan de Cuentas management page.
// Lists named charts for the selected company.
// Supports importing from a TXT/CSV file and deleting existing charts.
// Plan limits are enforced server-side; errors surface as inline messages.

import { useId, useRef, useState }              from 'react';
import { AnimatePresence, motion }               from 'framer-motion';
import { X, Check, Upload, Trash2 }              from 'lucide-react';
import { PageHeader }                            from '@/src/shared/frontend/components/page-header';
import { BaseButton }                            from '@/src/shared/frontend/components/base-button';
import { AccountingAccessGuard }                 from '@/src/modules/accounting/frontend/components/accounting-access-guard';
import { APP_SIZES }                             from '@/src/shared/frontend/sizes';
import { useCompany }                            from '@/src/modules/companies/frontend/hooks/use-companies';
import { useCharts }                             from '@/src/modules/accounting/frontend/hooks/use-charts';
import { parseChartFile }                        from '@/src/modules/accounting/frontend/utils/chart-import-parser';
import type { AccountChart }                     from '@/src/modules/accounting/backend/domain/account-chart';

// ── Constants ─────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
    "placeholder:text-neutral-400 focus:ring-2 focus:ring-primary-500/20",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] block mb-1.5";

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChartsPage() {
    const modalId                                = useId();
    const { companyId }                          = useCompany();
    const { data, loading, error, deleteChart, importChart } = useCharts(companyId);

    // Import modal state
    const [importOpen,    setImportOpen]    = useState(false);
    const [importName,    setImportName]    = useState('');
    const [importFile,    setImportFile]    = useState<File | null>(null);
    // Decoded text stored in state to reuse the same latin1 pass on confirm
    const [importText,    setImportText]    = useState<string | null>(null);
    const [importPreview, setImportPreview] = useState<{ count: number; skipped: number } | null>(null);
    const [importing,     setImporting]     = useState(false);
    const [importErr,     setImportErr]     = useState<string | null>(null);
    const fileInputRef                      = useRef<HTMLInputElement>(null);

    // Delete modal state
    const [deleteTarget, setDeleteTarget] = useState<AccountChart | null>(null);
    const [deleting,     setDeleting]     = useState(false);
    const [deleteErr,    setDeleteErr]    = useState<string | null>(null);

    // ── Import handlers ───────────────────────────────────────────────────────

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0] ?? null;
        setImportFile(file);
        setImportText(null);
        setImportPreview(null);
        setImportErr(null);

        if (!file) return;

        // Read with latin1 — Venezuelan accounting exports are often ISO-8859-1.
        // Store the decoded text so handleImport can reuse the same pass.
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setImportText(text);
            const { accounts, skipped } = parseChartFile(text);
            if (accounts.length === 0) {
                setImportErr('No se encontraron cuentas en el archivo. Verifica el formato.');
            } else {
                setImportPreview({ count: accounts.length, skipped });
            }
        };
        reader.readAsText(file, 'latin1');
    }

    function openImport() {
        setImportName('');
        setImportFile(null);
        setImportText(null);
        setImportPreview(null);
        setImportErr(null);
        setImportOpen(true);
    }

    function closeImport() {
        setImportOpen(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    async function handleImport() {
        if (!importText || !importPreview || !importFile) return;
        setImporting(true);
        setImportErr(null);
        try {
            // Reuse the already-decoded latin1 text — do NOT call importFile.text()
            // which always decodes as UTF-8 and would corrupt accented characters.
            const { accounts } = parseChartFile(importText);
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

                    {/* Loading state */}
                    {loading && (
                        <div className="flex items-center justify-center h-32 gap-3 border border-border-light rounded-xl bg-surface-1">
                            <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none">
                                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
                                <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            <span className="font-mono text-[13px] uppercase tracking-widest text-[var(--text-tertiary)]">Cargando planes…</span>
                        </div>
                    )}

                    {error && (
                        <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/[0.05]">
                            <p className="font-mono text-[13px] text-red-500">{error}</p>
                        </div>
                    )}

                    {!loading && data.length === 0 && !error && (
                        <div className="flex flex-col items-center justify-center h-40 border border-border-light rounded-xl text-[var(--text-tertiary)] gap-3 bg-surface-1">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4" />
                                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                                <path d="m3 15 2 2 4-4" />
                            </svg>
                            <div className="flex flex-col items-center gap-1">
                                <span className="font-mono text-[13px] uppercase tracking-widest">Sin planes de cuentas</span>
                                <span className="font-mono text-[11px]">Importa tu primer plan usando el botón de arriba.</span>
                            </div>
                        </div>
                    )}

                    {!loading && data.length > 0 && !error && (
                        <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                            {data.map((chart) => (
                                <div
                                    key={chart.id}
                                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 py-4 border-b border-border-light last:border-0 hover:bg-foreground/[0.02] transition-colors"
                                >
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <span className="font-mono text-[13px] font-semibold text-foreground truncate">
                                            {chart.name}
                                        </span>
                                        <span className="font-mono text-[11px] text-[var(--text-tertiary)] uppercase tracking-widest">
                                            {chart.accountCount.toLocaleString('es-VE')} cuentas
                                        </span>
                                    </div>
                                    <BaseButton.Root
                                        variant="danger"
                                        size="sm"
                                        onPress={() => { setDeleteTarget(chart); setDeleteErr(null); }}
                                        className="sm:self-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                    >
                                        Eliminar
                                    </BaseButton.Root>
                                </div>
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
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative w-full max-w-lg bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                        >
                            {/* Modal header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-2/30">
                                <div>
                                    <h2 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                        Importar Plan de Cuentas
                                    </h2>
                                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-wider">
                                        Archivo TXT / CSV
                                    </p>
                                </div>
                                <BaseButton.Icon variant="ghost" size="sm" onClick={closeImport}>
                                    <X size={14} />
                                </BaseButton.Icon>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="flex flex-col">
                                    <label htmlFor={`${modalId}-name`} className={labelCls}>
                                        Nombre del plan
                                        <span className="ml-1 normal-case tracking-normal text-[var(--text-tertiary)] opacity-70">(opcional)</span>
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
                                        Documento a subir
                                    </label>
                                    <div className="relative group">
                                        <input
                                            id={`${modalId}-file`}
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".txt,.csv"
                                            onChange={handleFileChange}
                                            className="block w-full font-mono text-[12px] text-[var(--text-secondary)] file:mr-4 file:py-1.5 file:px-4 file:rounded-md file:border-0 file:font-mono file:text-[11px] file:font-semibold file:uppercase file:tracking-[0.16em] file:bg-surface-2 file:text-foreground hover:file:bg-border-light/50 transition-all file:cursor-pointer p-1.5 rounded-xl border border-dashed border-border-light hover:border-border-medium bg-surface-1/50 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                                        />
                                    </div>
                                    <p className="font-mono text-[11px] text-[var(--text-tertiary)] mt-1 leading-relaxed">
                                        Formato MEISTER/Profit: una cuenta por línea.<br/>
                                        <span className="opacity-70">código,"nombre",G|M,nivel,...</span>
                                    </p>
                                </div>

                                {importPreview && (
                                    <div className="flex flex-col gap-1 px-4 py-3 rounded-xl bg-success/10 border border-success/20">
                                        <div className="flex items-center gap-2 text-success">
                                            <Check size={14} />
                                            <span className="font-mono text-[12px] font-semibold">
                                                {importPreview.count.toLocaleString('es-VE')} cuentas listas
                                            </span>
                                        </div>
                                        {importPreview.skipped > 0 && (
                                            <span className="font-mono text-[11px] text-success/70 pl-5">
                                                {importPreview.skipped} línea(s) omitida(s) (blanco o mal formato)
                                            </span>
                                        )}
                                    </div>
                                )}

                                {importErr && (
                                    <div className="p-3 rounded-lg bg-red-50 border border-red-100 dark:bg-red-500/10 dark:border-red-500/20">
                                        <p className="text-[10px] text-red-600 flex items-center gap-1.5 font-mono"><X size={10} /> {importErr}</p>
                                    </div>
                                )}
                            </div>

                            {/* Modal footer */}
                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light bg-surface-2/30">
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
                                    isDisabled={!importFile || !importPreview || importing}
                                    onClick={() => { void handleImport(); }}
                                    leftIcon={<Upload size={14} />}
                                >
                                    Importar ahora
                                </BaseButton.Root>
                            </div>
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
                                <div>
                                    <h2 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                        Eliminar plan
                                    </h2>
                                </div>
                                <BaseButton.Icon variant="ghost" size="sm" onClick={() => { setDeleteTarget(null); setDeleteErr(null); }}>
                                    <X size={14} />
                                </BaseButton.Icon>
                            </div>

                            <div className="p-6">
                                <p className="font-mono text-[13px] text-[var(--text-secondary)] leading-relaxed">
                                    ¿Eliminar el plan <span className="font-semibold text-foreground">{deleteTarget?.name}</span>?
                                    <br/><br/>
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
