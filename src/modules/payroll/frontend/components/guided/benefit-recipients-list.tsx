"use client";

import { useCallback, useMemo } from "react";
import { Check } from "lucide-react";
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import type { Employee } from "../../hooks/use-employee";

interface BenefitRecipientsListProps {
    employees: Employee[];
    /** Conjunto de cédulas EXCLUIDAS del beneficio (vacío = todos reciben). */
    excluded: Set<string>;
    onToggle: (cedula: string) => void;
    /** Bulk setter para soportar Todos / Ninguno / Invertir. */
    onSetExcluded: Dispatch<SetStateAction<Set<string>>>;
}

export function BenefitRecipientsList({
    employees,
    excluded,
    onToggle,
    onSetExcluded,
}: BenefitRecipientsListProps) {
    const activos = useMemo(
        () => employees.filter((e) => e.estado === "activo"),
        [employees],
    );

    const recipientsCount = useMemo(
        () => activos.filter((e) => !excluded.has(e.cedula)).length,
        [activos, excluded],
    );

    const noneSelected = activos.length > 0 && recipientsCount === 0;

    const selectAll  = useCallback(() => onSetExcluded(new Set()), [onSetExcluded]);
    const selectNone = useCallback(
        () => onSetExcluded(new Set(activos.map((e) => e.cedula))),
        [activos, onSetExcluded],
    );
    const invertSelection = useCallback(() => {
        const next = new Set<string>();
        for (const e of activos) {
            if (!excluded.has(e.cedula)) next.add(e.cedula);
        }
        onSetExcluded(next);
    }, [activos, excluded, onSetExcluded]);

    if (activos.length === 0) {
        return (
            <div className="mt-3 px-4 py-3 rounded-lg border border-dashed border-border-light/60 bg-surface-2/40">
                <p className="font-mono text-[12px] text-[var(--text-tertiary)] leading-relaxed">
                    Sin empleados activos. Activa al menos uno desde la sección de empleados para habilitar este beneficio.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-4 rounded-lg bg-surface-2/40 overflow-hidden">
            <div className="sticky top-0 z-10 bg-surface-2/95 backdrop-blur supports-[backdrop-filter]:bg-surface-2/80">
                <div className="flex items-start justify-between gap-3 px-3 pt-2.5 pb-1.5">
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                            ¿Quiénes lo reciben?
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-tertiary)]/80">
                            Aplica solo a este período. No queda guardado en el empleado.
                        </span>
                    </div>
                    <span
                        className={[
                            "font-mono text-[12px] font-bold tabular-nums shrink-0 pt-px",
                            noneSelected ? "text-amber-500" : "text-[var(--text-secondary)]",
                        ].join(" ")}
                    >
                        {recipientsCount} / {activos.length}
                    </span>
                </div>
                <div className="flex items-center gap-2 px-3 pb-2 border-b border-border-light/40">
                    <BulkAction onClick={selectAll}>Todos</BulkAction>
                    <Separator />
                    <BulkAction onClick={selectNone}>Ninguno</BulkAction>
                    <Separator />
                    <BulkAction onClick={invertSelection}>Invertir</BulkAction>
                </div>
                {noneSelected && (
                    <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/30">
                        <p className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                            Tilda al menos un empleado para generar este beneficio.
                        </p>
                    </div>
                )}
            </div>
            <ul className="divide-y divide-border-light/40 max-h-64 overflow-y-auto">
                {activos.map((e) => {
                    const isIncluded = !excluded.has(e.cedula);
                    const handleKeyDown = (ev: KeyboardEvent<HTMLLIElement>) => {
                        if (ev.key === " " || ev.key === "Enter") {
                            ev.preventDefault();
                            onToggle(e.cedula);
                        }
                    };
                    return (
                        <li
                            key={e.cedula}
                            role="checkbox"
                            aria-checked={isIncluded}
                            tabIndex={0}
                            onClick={() => onToggle(e.cedula)}
                            onKeyDown={handleKeyDown}
                            className={[
                                "flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none",
                                "transition-colors hover:bg-foreground/[0.03]",
                                "focus-visible:outline-none focus-visible:bg-foreground/[0.05]",
                                "focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary-500/40",
                                isIncluded ? "" : "opacity-55",
                            ].join(" ")}
                        >
                            <span
                                aria-hidden="true"
                                className={[
                                    "shrink-0 w-4 h-4 rounded-[3px] border flex items-center justify-center transition-colors",
                                    isIncluded
                                        ? "bg-primary-500 border-primary-500"
                                        : "bg-surface-1 border-border-medium",
                                ].join(" ")}
                            >
                                {isIncluded && (
                                    <Check size={11} strokeWidth={3} className="text-white" />
                                )}
                            </span>
                            <div className="flex flex-col leading-tight min-w-0 flex-1">
                                <span className="font-mono text-[12px] text-foreground truncate">
                                    {e.nombre}
                                </span>
                                <span className="font-mono text-[10px] text-[var(--text-tertiary)] truncate">
                                    <span className="uppercase tracking-[0.14em] tabular-nums">
                                        {e.cedula}
                                    </span>
                                    {e.cargo ? <span> · {e.cargo}</span> : null}
                                </span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function BulkAction({
    onClick,
    children,
}: {
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] hover:text-primary-500 transition-colors cursor-pointer"
        >
            {children}
        </button>
    );
}

function Separator() {
    return <span className="font-mono text-[10px] text-[var(--text-tertiary)]/40">·</span>;
}
