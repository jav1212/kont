"use client";

import { useMemo } from "react";
import { Checkbox } from "@heroui/react";
import type { Employee } from "../../hooks/use-employee";

interface BenefitRecipientsListProps {
    employees: Employee[];
    /** Conjunto de cédulas EXCLUIDAS del beneficio (vacío = todos reciben). */
    excluded: Set<string>;
    onToggle: (cedula: string) => void;
    /** Texto descriptivo del beneficio para el conteo (singular). */
    benefitNoun: string;
}

export function BenefitRecipientsList({
    employees,
    excluded,
    onToggle,
    benefitNoun,
}: BenefitRecipientsListProps) {
    const activos = useMemo(
        () => employees.filter((e) => e.estado === "activo"),
        [employees],
    );

    const recipientsCount = useMemo(
        () => activos.filter((e) => !excluded.has(e.cedula)).length,
        [activos, excluded],
    );

    if (activos.length === 0) {
        return (
            <div className="mt-3 px-4 py-3 rounded-lg border border-dashed border-border-light/60 bg-surface-2/40">
                <p className="font-mono text-[12px] text-[var(--text-tertiary)]">
                    No hay empleados activos para asignar.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-3 rounded-lg border border-border-light bg-surface-2/50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border-light/70 bg-surface-1/60">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    ¿Quiénes lo reciben?
                </span>
                <span className="font-mono text-[11px] tabular-nums text-[var(--text-secondary)]">
                    {recipientsCount} / {activos.length} {benefitNoun}
                </span>
            </div>
            <ul className="divide-y divide-border-light/50 max-h-64 overflow-y-auto">
                {activos.map((e) => {
                    const isIncluded = !excluded.has(e.cedula);
                    return (
                        <li
                            key={e.cedula}
                            className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-foreground/[0.02] transition-colors"
                        >
                            <Checkbox
                                color="primary"
                                size="sm"
                                disableAnimation
                                isSelected={isIncluded}
                                onValueChange={() => onToggle(e.cedula)}
                                classNames={{
                                    base: "items-center gap-2",
                                    wrapper: [
                                        "!w-3.5 !h-3.5 !min-w-[14px] !min-h-[14px]",
                                        "m-0 rounded-[3px] border-border-light",
                                        "after:bg-primary-500 before:border-border-medium",
                                    ].join(" "),
                                    label: "flex-1",
                                }}
                            >
                                <div className="flex flex-col leading-tight">
                                    <span className="font-mono text-[12px] text-foreground truncate max-w-[260px]">
                                        {e.nombre}
                                    </span>
                                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] tabular-nums">
                                        {e.cedula}
                                        {e.cargo ? ` · ${e.cargo}` : ""}
                                    </span>
                                </div>
                            </Checkbox>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
