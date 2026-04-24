"use client";

// Documents module dashboard (tablero).
// Entry point for the Documentos module — accessible on both web and PWA/mobile.
// Shows document indicators, recent uploads, and fast access to key operations.
// Constraint: read-only; all uploads and mutations happen inside /documents/files.

import { useMemo } from "react";
import {
    FolderTree,
    Files,
    CalendarClock,
    HardDrive,
    FileText,
    FileImage,
    FileSpreadsheet,
    File as FileIconLucide,
    FolderOpen,
    ArrowRight,
    Upload,
}                                   from "lucide-react";
import { ContextLink as Link }      from "@/src/shared/frontend/components/context-link";
import { PageHeader }               from "@/src/shared/frontend/components/page-header";
import { DashboardKpiCard }         from "@/src/shared/frontend/components/dashboard-kpi-card";
import { DashboardQuickActions }    from "@/src/shared/frontend/components/dashboard-quick-actions";
import { currentPeriod }            from "@/src/shared/frontend/utils/current-period";
import { useCompany }               from "@/src/modules/companies/frontend/hooks/use-companies";
import { useDocuments }             from "@/src/modules/documents/frontend/hooks/use-documents";

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTHS_ES: Record<string, string> = {
    "01": "Enero",  "02": "Febrero", "03": "Marzo",     "04": "Abril",
    "05": "Mayo",   "06": "Junio",   "07": "Julio",     "08": "Agosto",
    "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};

function formatPeriodLabel(p: string) {
    const [y, m] = p.split("-");
    return `${MONTHS_ES[m] ?? m} ${y}`;
}

function formatBytes(bytes: number) {
    if (bytes < 1024)               return `${bytes} B`;
    if (bytes < 1024 * 1024)        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelative(iso: string) {
    const d   = new Date(iso);
    const now = new Date();
    const ms  = now.getTime() - d.getTime();
    const mins = Math.floor(ms / 60_000);
    if (mins < 1)    return "ahora";
    if (mins < 60)   return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)    return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    if (days < 7)    return `hace ${days} d`;
    return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
}

function classify(mime: string | null | undefined): "pdf" | "image" | "sheet" | "other" {
    if (!mime) return "other";
    if (mime.includes("pdf"))                             return "pdf";
    if (mime.includes("image"))                           return "image";
    if (mime.includes("sheet") || mime.includes("excel")) return "sheet";
    return "other";
}

const KIND_META = {
    pdf:   { label: "PDF",    Icon: FileText,        cls: "text-error bg-error/10 border-error/15" },
    image: { label: "Imagen", Icon: FileImage,       cls: "text-primary-500 bg-primary-500/10 border-primary-500/15" },
    sheet: { label: "Hoja",   Icon: FileSpreadsheet, cls: "text-text-success bg-text-success/10 border-text-success/15" },
    other: { label: "Otro",   Icon: FileIconLucide,  cls: "text-[var(--text-secondary)] bg-surface-2 border-border-light" },
} as const;

// ── quick actions ─────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
    { href: "/documents/files", label: "Explorar archivos", desc: "Navegar carpetas y documentos", icon: FolderOpen },
    { href: "/companies",       label: "Empresas",          desc: "Gestionar empresas y carpetas", icon: FolderTree  },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function DocumentsDashboard() {
    const { companyId }                    = useCompany();
    const { folders, documents, loading }  = useDocuments(companyId ?? undefined);

    const periodo      = currentPeriod();
    const periodLabel  = formatPeriodLabel(periodo);

    const totals = useMemo(() => {
        const kindCounts = { pdf: 0, image: 0, sheet: 0, other: 0 };
        let size = 0;
        let thisPeriod = 0;
        for (const d of documents) {
            kindCounts[classify(d.mimeType)] += 1;
            size += d.sizeBytes ?? 0;
            if (d.createdAt?.startsWith(periodo)) thisPeriod += 1;
        }
        return {
            folders:    folders.length,
            documents:  documents.length,
            thisPeriod,
            size,
            kindCounts,
        };
    }, [folders, documents, periodo]);

    const folderNameById = useMemo(
        () => new Map(folders.map((f) => [f.id, f.name] as const)),
        [folders],
    );

    const recent = useMemo(
        () => [...documents]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 6),
        [documents],
    );

    return (
        <div className="flex flex-col min-h-full bg-surface-2 font-mono">
            <PageHeader title="Documentos" subtitle={`Tablero — ${periodLabel}`}>
                <Link
                    href="/documents/files"
                    className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[13px] uppercase tracking-[0.12em] flex items-center gap-1.5 transition-colors shadow-sm"
                >
                    <Upload size={14} strokeWidth={2} />
                    Subir archivos
                </Link>
            </PageHeader>

            <div className="flex flex-col gap-6 px-8 py-6">

                {/* KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <DashboardKpiCard
                        label="Carpetas"
                        value={totals.folders}
                        icon={FolderTree}
                        color="primary"
                        loading={loading}
                        sublabel={totals.folders === 1 ? "1 carpeta activa" : `${totals.folders} carpetas activas`}
                    />
                    <DashboardKpiCard
                        label="Documentos"
                        value={totals.documents}
                        icon={Files}
                        color="default"
                        loading={loading}
                        sublabel="Total almacenado"
                    />
                    <DashboardKpiCard
                        label="Subidos este mes"
                        value={totals.thisPeriod}
                        icon={CalendarClock}
                        color="success"
                        loading={loading}
                        sublabel={periodLabel}
                    />
                    <DashboardKpiCard
                        label="Almacenamiento"
                        value={formatBytes(totals.size)}
                        icon={HardDrive}
                        color="default"
                        loading={loading}
                        sublabel="Peso total en disco"
                    />
                </div>

                {/* Breakdown por tipo */}
                {!loading && totals.documents > 0 && (
                    <div className="rounded-2xl border border-border-light bg-surface-1 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)] flex items-center gap-2">
                                <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                                Desglose por tipo
                            </h2>
                            <span className="font-mono text-[11px] tabular-nums text-foreground/40">
                                {totals.documents} total
                            </span>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {(["pdf", "image", "sheet", "other"] as const).map((k) => {
                                const meta  = KIND_META[k];
                                const count = totals.kindCounts[k];
                                const pct   = totals.documents > 0
                                    ? Math.round((count / totals.documents) * 100)
                                    : 0;
                                return (
                                    <div
                                        key={k}
                                        className="flex flex-col gap-2 p-3 rounded-xl border border-border-light bg-surface-2/40"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className={`w-8 h-8 rounded-lg border flex items-center justify-center ${meta.cls}`}>
                                                <meta.Icon size={16} strokeWidth={2} />
                                            </div>
                                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                                {meta.label}
                                            </span>
                                        </div>
                                        <div className="flex items-baseline justify-between gap-2">
                                            <span className="font-mono text-[20px] font-bold tabular-nums text-foreground leading-none">
                                                {count}
                                            </span>
                                            <span className="font-mono text-[11px] tabular-nums text-foreground/40">
                                                {pct}%
                                            </span>
                                        </div>
                                        <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-primary-500/60 transition-all duration-500"
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Recent documents */}
                {!loading && recent.length > 0 && (
                    <div className="rounded-2xl border border-border-light bg-surface-1 overflow-hidden">
                        <div className="px-5 py-3 border-b border-border-light flex items-center justify-between bg-surface-2/30">
                            <h2 className="text-[12px] uppercase tracking-[0.14em] font-bold text-[var(--text-tertiary)] flex items-center gap-2">
                                <span className="w-1 h-3 rounded-full bg-primary-500/50" />
                                Documentos recientes
                            </h2>
                            <Link
                                href="/documents/files"
                                className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.12em] font-bold text-primary-500 hover:text-primary-600 transition-colors"
                            >
                                Ver todos
                                <ArrowRight size={12} strokeWidth={2.2} />
                            </Link>
                        </div>
                        <ul className="divide-y divide-border-light/60">
                            {recent.map((doc) => {
                                const k    = classify(doc.mimeType);
                                const meta = KIND_META[k];
                                const folderName = doc.folderId ? folderNameById.get(doc.folderId) : undefined;
                                return (
                                    <li
                                        key={doc.id}
                                        className="px-5 py-3 flex items-center gap-3 hover:bg-surface-2/40 transition-colors"
                                    >
                                        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${meta.cls}`}>
                                            <meta.Icon size={15} strokeWidth={2} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-mono text-[13px] text-foreground truncate">
                                                {doc.name}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5 font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
                                                {folderName && (
                                                    <>
                                                        <span className="inline-flex items-center gap-1">
                                                            <FolderOpen size={10} strokeWidth={2} />
                                                            <span className="truncate max-w-[120px]">{folderName}</span>
                                                        </span>
                                                        <span className="w-1 h-1 rounded-full bg-border-medium" aria-hidden="true" />
                                                    </>
                                                )}
                                                {doc.sizeBytes != null && (
                                                    <>
                                                        <span>{formatBytes(doc.sizeBytes)}</span>
                                                        <span className="w-1 h-1 rounded-full bg-border-medium" aria-hidden="true" />
                                                    </>
                                                )}
                                                <span>{formatRelative(doc.createdAt)}</span>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {/* Empty state */}
                {!loading && documents.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-border-light bg-surface-1/50 px-6 py-10 flex flex-col items-center text-center">
                        <div className="w-14 h-14 rounded-2xl bg-surface-1 border border-border-light flex items-center justify-center mb-4 shadow-sm">
                            <Files className="text-foreground/30" size={26} strokeWidth={2} />
                        </div>
                        <p className="font-mono text-[13px] uppercase tracking-[0.1em] text-foreground mb-1">
                            No hay documentos
                        </p>
                        <p className="font-sans text-[12px] text-[var(--text-tertiary)] mb-4 max-w-[280px]">
                            Sube tu primer archivo o crea carpetas base para organizar tu plantilla contable.
                        </p>
                        <Link
                            href="/documents/files"
                            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-mono text-[12px] uppercase tracking-[0.12em] transition-colors"
                        >
                            <Upload size={14} strokeWidth={2} />
                            Subir documento
                        </Link>
                    </div>
                )}

                {/* Quick actions */}
                <DashboardQuickActions actions={QUICK_ACTIONS} columns={2} />

            </div>
        </div>
    );
}
