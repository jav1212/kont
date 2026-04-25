"use client";

import { Calendar, ChevronDown, ClipboardCheck, Info, Users } from "lucide-react";
import type { Employee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { FIELD_CLS } from "./field-styles";

// ============================================================================
// EmployeeSelect
// ============================================================================

export interface EmployeeSelectProps {
    employees:        Employee[];
    selectedCedula:   string;
    onChange(cedula: string): void;
    onlyActive?:      boolean;
    /** label shown when nothing is selected (defaults to batch hint) */
    placeholder?:     string;
}

export function EmployeeSelect({
    employees,
    selectedCedula,
    onChange,
    onlyActive = true,
    placeholder = "Lote por defecto (Todos)",
}: EmployeeSelectProps) {
    return (
        <div className="relative">
            <Users size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
            <select
                value={selectedCedula}
                onChange={(e) => onChange(e.target.value)}
                className={FIELD_CLS + " pl-9"}
            >
                <option value="">{placeholder}</option>
                <optgroup label="Empleados">
                    {employees
                        .filter((e) => !onlyActive || e.estado === "activo")
                        .sort((a, b) => a.nombre.localeCompare(b.nombre))
                        .map((e) => (
                            <option key={e.cedula} value={e.cedula}>
                                {e.nombre} ({e.cedula})
                            </option>
                        ))
                    }
                </optgroup>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
        </div>
    );
}

// ============================================================================
// EmployeeInfoCard
// ============================================================================

export interface EmployeeInfoCardProps {
    employee: Employee;
}

export function EmployeeInfoCard({ employee }: EmployeeInfoCardProps) {
    const rows: Array<{ key: string; value: string; icon: React.ReactNode }> = [
        { key: "Cédula",  value: employee.cedula,                icon: <Info size={12} /> },
        { key: "Cargo",   value: employee.cargo || "—",          icon: <ClipboardCheck size={12} /> },
        { key: "Ingreso", value: employee.fechaIngreso ?? "—",   icon: <Calendar size={12} /> },
    ];
    return (
        <div className="p-3.5 rounded-xl border border-border-light bg-surface-2/[0.03] space-y-2.5 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500/40" />
            {rows.map(({ key, value, icon }) => (
                <div key={key} className="flex justify-between items-center font-mono text-[11px]">
                    <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                        {icon}
                        <span className="uppercase tracking-wider">{key}</span>
                    </div>
                    <span className="text-foreground font-bold tabular-nums">{value}</span>
                </div>
            ))}
        </div>
    );
}
