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
    // ── Per-employee monto override (opcional). Si se pasan estas props se
    //    activa un input compacto por fila para editar el monto individual.
    overrides?: Map<string, string>;
    onAmountChange?: (cedula: string, raw: string) => void;
    onClearOverrides?: () => void;
    /** Monto global (raw input), se muestra como placeholder del override. */
    globalAmount?: string;
    /** Moneda activa del global; dicta el prefix ("$" o "Bs"). */
    currency?: "USD" | "VES";
}

export function BenefitRecipientsList({
    employees,
    excluded,
    onToggle,
    onSetExcluded,
    overrides,
    onAmountChange,
    onClearOverrides,
    globalAmount,
    currency,
}: BenefitRecipientsListProps) {
    const activos = useMemo(
        () => employees.filter((e) => e.estado === "activo"),
        [employees],
    );

    const recipientsCount = useMemo(
        () => activos.filter((e) => !excluded.has(e.cedula)).length,
        [activos, excluded],
    );

    const overridesCount = useMemo(() => {
        if (!overrides) return 0;
        let n = 0;
        for (const e of activos) {
            const v = overrides.get(e.cedula);
            if (v && v.trim() !== "") n += 1;
        }
        return n;
    }, [activos, overrides]);

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

    const showOverrideInput = !!onAmountChange;
    const prefix = currency === "VES" ? "Bs" : "$";

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
                            {showOverrideInput
                                ? "Deja vacío para usar el monto global. Escribe para personalizar."
                                : "Aplica solo a este período. No queda guardado en el empleado."}
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
                    {showOverrideInput && onClearOverrides && overridesCount > 0 && (
                        <>
                            <Separator />
                            <BulkAction onClick={onClearOverrides}>
                                Limpiar montos ({overridesCount})
                            </BulkAction>
                        </>
                    )}
                </div>
                {noneSelected && (
                    <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/30">
                        <p className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
                            Tilda al menos un empleado para generar este beneficio.
                        </p>
                    </div>
                )}
            </div>
            <ul className="divide-y divide-border-light/40 max-h-72 overflow-y-auto">
                {activos.map((e) => {
                    const isIncluded = !excluded.has(e.cedula);
                    const overrideRaw = overrides?.get(e.cedula) ?? "";
                    const hasOverride = overrideRaw.trim() !== "";
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
                                hasOverride && isIncluded ? "border-l-2 border-primary-500/60 -ml-[2px] pl-[10px]" : "",
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
                            {showOverrideInput && (
                                <div
                                    className="shrink-0 flex items-center"
                                    onClick={(ev) => ev.stopPropagation()}
                                    onKeyDown={(ev) => ev.stopPropagation()}
                                >
                                    <div
                                        className={[
                                            "flex items-center h-7 rounded-md border bg-surface-1 transition-colors",
                                            !isIncluded
                                                ? "border-border-light/40 opacity-60"
                                                : hasOverride
                                                    ? "border-primary-500/60 bg-primary-500/[0.04]"
                                                    : "border-border-light",
                                        ].join(" ")}
                                    >
                                        <span className="px-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                            {prefix}
                                        </span>
                                        <input
                                            type="number"
                                            inputMode="decimal"
                                            min={0}
                                            step={0.01}
                                            value={overrideRaw}
                                            onChange={(ev) => onAmountChange!(e.cedula, ev.target.value)}
                                            placeholder={globalAmount || "0.00"}
                                            disabled={!isIncluded}
                                            aria-label={`Monto para ${e.nombre}`}
                                            className={[
                                                "w-20 h-full bg-transparent outline-none border-0",
                                                "font-mono text-[12px] tabular-nums text-right pr-2",
                                                "placeholder:text-[var(--text-tertiary)]/60",
                                                hasOverride && isIncluded ? "text-primary-600 font-semibold" : "text-foreground",
                                                "disabled:cursor-not-allowed",
                                                // hide native number spinners
                                                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                                            ].join(" ")}
                                        />
                                    </div>
                                </div>
                            )}
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
