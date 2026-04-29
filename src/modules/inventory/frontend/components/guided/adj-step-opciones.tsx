"use client";

import { GuidedStepShell, StepSection } from "@/src/modules/payroll/frontend/components/guided/guided-step-shell";
import type { Department } from "@/src/modules/inventory/frontend/hooks/use-inventory";

export interface AdjStepOpcionesProps {
    departments: Department[];
    departmentId: string;
    setDepartmentId: (v: string) => void;
    excludeZeroCost: boolean;
    setExcludeZeroCost: (v: boolean) => void;
    reference: string;
    setReference: (v: string) => void;
    onBack: () => void;
    onNext: () => void;
}

const labelCls =
    "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

const fieldCls = [
    "h-11 px-3 rounded-lg border border-border-light bg-surface-1 outline-none w-full",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

export function AdjStepOpciones({
    departments,
    departmentId,
    setDepartmentId,
    excludeZeroCost,
    setExcludeZeroCost,
    reference,
    setReference,
    onBack,
    onNext,
}: AdjStepOpcionesProps) {
    const activeDepartments = departments.filter((d) => d.active);

    return (
        <GuidedStepShell
            title="¿Qué productos deben absorber el ajuste?"
            subtitle="Restringe el universo de productos que recibirán el delta. Por defecto se incluyen todos los productos activos con costo promedio mayor a cero."
            onBack={onBack}
            onNext={onNext}
            centerHeader
        >
            <StepSection
                title="Departamento"
                description="Limita el ajuste a un departamento específico, o déjalo en todos para incluir el catálogo completo."
            >
                <div>
                    <label className={labelCls}>Departamento</label>
                    <select
                        className={fieldCls}
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                    >
                        <option value="">Todos los departamentos</option>
                        {activeDepartments.map((d) => (
                            <option key={d.id} value={d.id ?? ""}>
                                {d.name}
                            </option>
                        ))}
                    </select>
                </div>
            </StepSection>

            <StepSection
                title="Productos sin costo promedio"
                description="Productos con costo promedio = 0 no pueden valorarse en bolívares. Por defecto se excluyen del cálculo del delta."
            >
                <button
                    type="button"
                    onClick={() => setExcludeZeroCost(!excludeZeroCost)}
                    className={[
                        "w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-center gap-3",
                        excludeZeroCost
                            ? "border-primary-500/40 bg-primary-500/[0.06]"
                            : "border-border-light bg-surface-1 hover:bg-surface-2",
                    ].join(" ")}
                    aria-pressed={excludeZeroCost}
                >
                    <span
                        className={[
                            "shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors",
                            excludeZeroCost
                                ? "border-primary-500 bg-primary-500 text-white"
                                : "border-border-medium",
                        ].join(" ")}
                    >
                        {excludeZeroCost && (
                            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 5.5l2.5 2.5L9 3" />
                            </svg>
                        )}
                    </span>
                    <span className="flex-1">
                        <span className="block font-mono text-[13px] text-foreground">
                            Excluir productos con costo promedio = 0
                        </span>
                        <span className="block font-mono text-[11px] text-[var(--text-tertiary)] mt-0.5">
                            {excludeZeroCost
                                ? "Activado · sólo participan productos con costo &gt; 0"
                                : "Desactivado · todos los productos serán incluidos (los de costo 0 quedan con Δqty = 0)"}
                        </span>
                    </span>
                </button>
            </StepSection>

            <StepSection
                title="Referencia"
                description="Texto opcional para identificar este ajuste en tus notas. No se persiste ya que el ajuste no genera movimientos."
            >
                <input
                    className={fieldCls}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Ej: Ajuste 80% sobre entradas"
                />
            </StepSection>
        </GuidedStepShell>
    );
}
