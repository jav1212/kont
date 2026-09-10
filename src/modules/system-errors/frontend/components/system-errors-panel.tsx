"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ResolutionStatus, SystemErrorPage, SystemErrorRecord } from "@/src/modules/system-errors/backend/domain/system-error";

const PAGE_SIZE = 25;

type ErrorFilter = "pending" | "resolved" | "all";

interface ApiResponse<T> {
    data?: T;
    error?: string;
}

/** Formats a persisted timestamp for the administrator locale. */
function formatDateTime(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("es-VE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/** Converts metadata into safe, readable JSON for the incident detail. */
function formatMetadata(metadata: SystemErrorRecord["metadata"]): string {
    if (metadata == null) return "—";
    try {
        return JSON.stringify(metadata, null, 2);
    } catch {
        return String(metadata);
    }
}

/** Renders a loading indicator shared by the errors panel states. */
function Spinner(): React.ReactNode {
    return (
        <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
            <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

/**
 * Displays searchable, resolvable system incidents in the administrator portal.
 * @returns The administrator incident list and controls.
 */
export function SystemErrorsPanel(): React.ReactNode {
    const [filter, setFilter] = useState<ErrorFilter>("pending");
    const [code, setCode] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState<SystemErrorPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedCode, setExpandedCode] = useState<string | null>(null);
    const [savingCode, setSavingCode] = useState<string | null>(null);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const requestVersion = useRef(0);

    const load = useCallback(async (requestedPage: number, requestedFilter: ErrorFilter, requestedCode: string) => {
        const version = ++requestVersion.current;
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({ page: String(requestedPage), pageSize: String(PAGE_SIZE) });
        if (requestedFilter !== "all") params.set("status", requestedFilter);
        if (requestedCode.trim()) params.set("code", requestedCode.trim());

        try {
            const response = await fetch(`/api/admin/system-errors?${params.toString()}`);
            const payload = await response.json() as ApiResponse<SystemErrorPage>;
            if (!response.ok || !payload.data) throw new Error(payload.error ?? "No se pudieron cargar los errores.");
            if (version !== requestVersion.current) return;
            if (payload.data.items.length === 0 && requestedPage > 1) {
                setPage(Math.max(1, Math.ceil(payload.data.total / PAGE_SIZE)));
                return;
            }
            setData(payload.data);
        } catch (cause) {
            if (version !== requestVersion.current) return;
            setError(cause instanceof Error ? cause.message : "No se pudieron cargar los errores.");
            setData(null);
        } finally {
            if (version === requestVersion.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void load(page, filter, code);
        }, code ? 250 : 0);
        return () => {
            window.clearTimeout(timer);
            requestVersion.current += 1;
        };
    }, [code, filter, load, page]);

    const setNewFilter = useCallback((nextFilter: ErrorFilter) => {
        if (nextFilter === filter && page === 1) return;
        requestVersion.current += 1;
        setFilter(nextFilter);
        setPage(1);
        setExpandedCode(null);
    }, [filter, page]);

    const setNewCode = useCallback((nextCode: string) => {
        requestVersion.current += 1;
        setCode(nextCode);
        setPage(1);
        setExpandedCode(null);
    }, []);

    const copyCode = useCallback(async (errorCode: string) => {
        try {
            await navigator.clipboard.writeText(errorCode);
            setCopiedCode(errorCode);
            window.setTimeout(() => setCopiedCode((current) => current === errorCode ? null : current), 1500);
        } catch {
            setError("No se pudo copiar el código del error.");
        }
    }, []);

    const updateStatus = useCallback(async (item: SystemErrorRecord, status: ResolutionStatus) => {
        setSavingCode(item.errorCode);
        setError(null);
        try {
            const response = await fetch(`/api/admin/system-errors/${encodeURIComponent(item.errorCode)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            const payload = await response.json() as ApiResponse<SystemErrorRecord>;
            if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar el error.");
            await load(page, filter, code);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "No se pudo actualizar el error.");
        } finally {
            setSavingCode(null);
        }
    }, [code, filter, load, page]);

    const items = data?.items ?? [];
    const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

    return (
        <section className="space-y-4" aria-label="Errores del sistema">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Observabilidad</p>
                    <p className="font-mono text-[12px] text-foreground">
                        Errores registrados
                        {data && (
                            <span className="ml-2 text-[10px] text-[var(--text-tertiary)] tabular-nums">
                                {data.total} {data.total === 1 ? "incidente" : "incidentes"}
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => void load(page, filter, code)}
                    disabled={loading || savingCode !== null}
                    className="h-8 px-3 rounded-lg border border-border-light font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] hover:text-foreground hover:border-border-medium disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5"
                >
                    {loading && <Spinner />}
                    Recargar
                </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1" role="group" aria-label="Filtrar errores por estado">
                    {(["pending", "resolved", "all"] as const).map((status) => (
                        <button
                            key={status}
                            disabled={savingCode !== null || filter === status}
                            onClick={() => setNewFilter(status)}
                            className={[
                                "h-7 px-3 rounded-lg border font-mono text-[9px] uppercase tracking-[0.15em] transition-colors disabled:opacity-50",
                                filter === status
                                    ? "bg-foreground/[0.08] border-border-medium text-foreground"
                                    : "border-border-light text-[var(--text-tertiary)] hover:text-foreground",
                            ].join(" ")}
                        >
                            {status === "pending" ? "Pendientes" : status === "resolved" ? "Resueltos" : "Todos"}
                        </button>
                    ))}
                </div>
                <input
                    disabled={savingCode !== null}
                    value={code}
                    onChange={(event) => setNewCode(event.target.value)}
                    placeholder="Buscar código KNT-…"
                    aria-label="Buscar errores por código"
                    className="h-8 w-full sm:w-60 rounded-lg border border-border-light bg-surface-1 px-3 font-mono text-[11px] text-foreground placeholder:text-[var(--text-disabled)] outline-none focus:border-primary-500 disabled:opacity-50"
                />
            </div>

            {error && (
                <div role="alert" aria-live="polite" className="flex items-center justify-between gap-3 border border-red-500/20 bg-red-500/[0.04] rounded-xl px-4 py-3">
                    <p className="font-mono text-[10px] text-red-500">{error}</p>
                    <button onClick={() => void load(page, filter, code)} className="shrink-0 font-mono text-[9px] uppercase tracking-[0.15em] text-red-500 hover:underline">
                        Reintentar
                    </button>
                </div>
            )}

            <div className="border border-border-light rounded-xl overflow-x-auto bg-surface-1">
                <table className="w-full min-w-[900px]">
                    <thead>
                        <tr className="border-b border-border-light bg-surface-2">
                            {["Código", "Fecha", "Mensaje", "Origen", "Usuario", "Estado", "Acción"].map((label) => (
                                <th key={label} className="px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] whitespace-nowrap">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && items.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center">
                                    <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-[var(--text-disabled)]">
                                        <Spinner /> Cargando errores…
                                    </span>
                                </td>
                            </tr>
                        ) : !loading && items.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-4 py-10 text-center font-mono text-[11px] text-[var(--text-disabled)] uppercase tracking-widest">
                                    {code ? "No hay errores que coincidan con el código" : "Sin errores en este estado"}
                                </td>
                            </tr>
                        ) : (
                            items.map((item) => {
                                const expanded = expandedCode === item.errorCode;
                                const saving = savingCode === item.errorCode;
                                return (
                                    <Fragment key={item.id}>
                                        <tr
                                            className={[
                                                "border-b border-border-light/60 last:border-b-0 transition-colors",
                                                expanded ? "bg-primary-500/[0.05]" : "hover:bg-foreground/[0.02]",
                                            ].join(" ")}
                                        >
                                            <td className="px-3 py-3">
                                                <button
                                                    onClick={() => void copyCode(item.errorCode)}
                                                    title="Copiar código"
                                                    className="font-mono text-[10px] font-medium text-primary-500 hover:underline focus-visible:outline focus-visible:outline-primary-500 rounded"
                                                >
                                                    {copiedCode === item.errorCode ? "Copiado" : item.errorCode}
                                                </button>
                                            </td>
                                            <td className="px-3 py-3 font-mono text-[10px] text-[var(--text-secondary)] whitespace-nowrap">
                                                {formatDateTime(item.createdAt)}
                                            </td>
                                            <td className="px-3 py-3 font-mono text-[11px] text-foreground max-w-[260px] truncate" title={item.message}>
                                                {item.message}
                                            </td>
                                            <td className="px-3 py-3 font-mono text-[10px] text-[var(--text-secondary)]">{item.source ?? "—"}</td>
                                            <td className="px-3 py-3 font-mono text-[10px] leading-relaxed">
                                                <p className="text-foreground max-w-[180px] truncate">
                                                    {item.user?.name ?? item.user?.email ?? "Usuario no identificado"}
                                                </p>
                                                {item.user?.name && item.user.email && (
                                                    <p className="text-[var(--text-tertiary)] max-w-[180px] truncate">{item.user.email}</p>
                                                )}
                                            </td>
                                            <td className="px-3 py-3">
                                                <span
                                                    className={[
                                                        "inline-flex rounded border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em]",
                                                        item.resolutionStatus === "resolved"
                                                            ? "border-green-500/20 bg-green-500/[0.08] text-green-600 dark:text-green-400"
                                                            : "border-amber-500/20 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400",
                                                    ].join(" ")}
                                                >
                                                    {item.resolutionStatus === "resolved" ? "Resuelto" : "Pendiente"}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setExpandedCode(expanded ? null : item.errorCode)}
                                                        aria-expanded={expanded}
                                                        className="font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] hover:text-foreground"
                                                    >
                                                        {expanded ? "Cerrar" : "Detalle"}
                                                    </button>
                                                    <button
                                                        disabled={saving || savingCode !== null}
                                                        onClick={() => void updateStatus(item, item.resolutionStatus === "resolved" ? "pending" : "resolved")}
                                                        className="h-7 rounded-lg border border-border-light px-2 font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-foreground hover:border-border-medium disabled:opacity-50"
                                                    >
                                                        {saving ? "Guardando…" : item.resolutionStatus === "resolved" ? "Reabrir" : "Resolver"}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expanded && (
                                            <tr className="bg-surface-2/40 border-b border-border-light/60">
                                                <td colSpan={7} className="px-4 py-4">
                                                    <ErrorDetail item={item} />
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {data && data.total > 0 && (
                <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums">
                        Página {data.page} de {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            disabled={loading || savingCode !== null || data.page <= 1}
                            onClick={() => setPage((current) => current - 1)}
                            className="h-8 px-3 rounded-lg border border-border-light font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)] hover:text-foreground disabled:opacity-50"
                        >
                            Anterior
                        </button>
                        <button
                            disabled={loading || savingCode !== null || data.page >= totalPages}
                            onClick={() => setPage((current) => current + 1)}
                            className="h-8 px-3 rounded-lg border border-border-light font-mono text-[9px] uppercase tracking-[0.14em] text-[var(--text-secondary)] hover:text-foreground disabled:opacity-50"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}

/** Renders technical incident data that is hidden until an administrator requests it. */
function ErrorDetail({ item }: { item: SystemErrorRecord }): React.ReactNode {
    const details: Array<[string, string | number | null]> = [
        ["Mensaje", item.message],
        ["Ruta", item.route],
        ["Método", item.method],
        ["HTTP", item.statusCode],
        ["Tenant", item.tenantId],
        ["Usuario ID", item.userId],
        ["Solicitud", item.requestId],
        [
            "Resuelto por",
            item.resolver
                ? `${item.resolver.name ?? item.resolver.email ?? "Administrador"}${item.resolver.name && item.resolver.email ? ` · ${item.resolver.email}` : ""}`
                : item.resolvedBy,
        ],
        ["Fecha de resolución", formatDateTime(item.resolvedAt)],
    ];
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 font-mono text-[10px]">
                {details.map(([label, value]) => (
                    <Fragment key={label}>
                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.15em]">{label}</span>
                        <span className="text-foreground break-words">{value ?? "—"}</span>
                    </Fragment>
                ))}
            </div>
            <TechnicalBlock label="Mensaje técnico" value={item.technicalMessage} />
            <TechnicalBlock label="Traza" value={item.stackTrace} />
            <TechnicalBlock label="Metadatos" value={formatMetadata(item.metadata)} />
        </div>
    );
}

/** Renders a preformatted technical value only when the incident includes it. */
function TechnicalBlock({ label, value }: { label: string; value: string | null }): React.ReactNode {
    if (!value || value === "—") return null;
    return (
        <div>
            <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">{label}</p>
            <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-mono text-[10px] text-[var(--text-secondary)]">
                {value}
            </pre>
        </div>
    );
}
