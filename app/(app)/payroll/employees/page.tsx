"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";
import { notify } from "@/src/shared/frontend/notify";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import {
    employeesToCsv,
    downloadCsv,
    parseCsv,
} from "@/src/modules/payroll/frontend/utils/employee-csv";
import type {
    Employee,
    EmployeeEstado,
    EmployeeMoneda,
    SalaryHistoryEntry,
} from "@/src/modules/payroll/frontend/hooks/use-employee";
import {
    Users,
    UserCheck,
    UserMinus,
    Palmtree,
    Download,
    Upload,
    Plus,
    Search,
    Trash2,
    Pencil,
    Check,
    X,
    Clock,
    Loader2,
    AlertTriangle,
    ClipboardPaste,
    ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ────────────────────────────────────────────────────────────────────

type RowMode = "view" | "edit" | "new";
type EstadoFilter = "todos" | EmployeeEstado;

interface RowState {
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioMensual: string;
    moneda:         EmployeeMoneda;
    estado:         EmployeeEstado;
    fechaIngreso:   string;
    porcentajeIslr: string;
}

const ESTADOS: EmployeeEstado[] = ["activo", "vacacion", "inactivo"];
const ESTADO_LABEL: Record<EmployeeEstado, string> = {
    activo:   "Activo",
    vacacion: "Vacación",
    inactivo: "Inactivo",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function employeeToRow(e: Employee): RowState {
    return {
        cedula:         e.cedula,
        nombre:         e.nombre,
        cargo:          e.cargo,
        salarioMensual: String(e.salarioMensual),
        moneda:         e.moneda ?? "VES",
        estado:         e.estado,
        fechaIngreso:   e.fechaIngreso ?? "",
        porcentajeIslr: String(e.porcentajeIslr ?? 0),
    };
}

function calcAntiguedad(fechaIngreso: string | null | undefined): string {
    if (!fechaIngreso) return "—";
    const start = new Date(fechaIngreso + "T00:00:00");
    const now   = new Date();
    let years   = now.getFullYear() - start.getFullYear();
    let months  = now.getMonth()    - start.getMonth();
    if (months < 0) { years--; months += 12; }
    if (years === 0 && months === 0) return "< 1 mes";
    const parts: string[] = [];
    if (years  > 0) parts.push(`${years}a`);
    if (months > 0) parts.push(`${months}m`);
    return parts.join(" ");
}

function fmtMoney(n: number): string {
    return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
    return new Date(iso + "T00:00:00").toLocaleDateString("es-VE", {
        day: "2-digit", month: "short", year: "numeric",
    });
}

// ── Page-local primitives ────────────────────────────────────────────────────

function StatTile({
    label, value, sublabel, icon: Icon, tone = "default",
}: {
    label:    string;
    value:    string | number;
    sublabel?: string;
    icon:     React.ComponentType<{ size?: number; strokeWidth?: number }>;
    tone?:    "default" | "primary" | "success" | "warning" | "muted";
}) {
    const toneCls: Record<string, string> = {
        default: "bg-surface-2 text-foreground border-border-light",
        primary: "bg-primary-500/10 text-primary-500 border-primary-500/20",
        success: "bg-success/10 text-text-success border-success/20",
        warning: "bg-warning/10 text-text-warning border-warning/20",
        muted:   "bg-surface-2 text-[var(--text-tertiary)] border-border-light",
    };
    return (
        <div className="rounded-xl border border-border-light bg-surface-1 px-5 py-4 shadow-sm flex items-center gap-4">
            <div className={`h-10 w-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${toneCls[tone]}`}>
                <Icon size={18} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                    {label}
                </p>
                <p className="font-mono text-[22px] font-semibold tabular-nums text-foreground leading-tight">
                    {value}
                </p>
                {sublabel && (
                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] truncate">
                        {sublabel}
                    </p>
                )}
            </div>
        </div>
    );
}

function FilterChip({
    active, onClick, children, count,
}: {
    active:    boolean;
    onClick:   () => void;
    children:  React.ReactNode;
    count?:    number;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={[
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border whitespace-nowrap",
                "font-mono text-[11px] uppercase tracking-[0.12em] font-medium",
                "transition-colors duration-150",
                "focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-1 outline-none",
                active
                    ? "border-primary-500 bg-primary-500/10 text-primary-500"
                    : "border-border-light bg-surface-1 text-[var(--text-secondary)] hover:border-border-default hover:bg-surface-2",
            ].join(" ")}
        >
            <span>{children}</span>
            {typeof count === "number" && (
                <span className={[
                    "tabular-nums text-[10px] px-1 rounded",
                    active ? "bg-primary-500/15" : "bg-surface-2 border border-border-light",
                ].join(" ")}>
                    {count}
                </span>
            )}
        </button>
    );
}

function StatusBadge({ estado }: { estado: EmployeeEstado }) {
    const map: Record<EmployeeEstado, { cls: string; dot: string }> = {
        activo:   { cls: "badge-success", dot: "bg-text-success" },
        vacacion: { cls: "badge-warning", dot: "bg-text-warning" },
        inactivo: { cls: "bg-surface-2 border-border-light text-[var(--text-tertiary)]", dot: "bg-[var(--text-tertiary)]" },
    };
    const { cls, dot } = map[estado];
    return (
        <span className={[
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded border",
            "font-mono text-[11px] uppercase tracking-[0.12em] font-medium",
            cls,
        ].join(" ")}>
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            {ESTADO_LABEL[estado]}
        </span>
    );
}

const Spinner = () => (
    <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={13} />
);

// ── Inline cell shells (edit mode) ───────────────────────────────────────────

const cellInputCls = [
    "w-full h-9 px-3 rounded-lg border bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground tabular-nums",
    "border-border-default hover:border-border-medium focus:border-primary-500",
    "transition-colors duration-150",
].join(" ");

function MoneySalaryInput({
    moneda, salarioMensual, onChange,
}: {
    moneda:         EmployeeMoneda;
    salarioMensual: string;
    onChange:       (field: "moneda" | "salarioMensual", value: string) => void;
}) {
    return (
        <div className="flex h-9 rounded-lg border border-border-default bg-surface-1 hover:border-border-medium focus-within:border-primary-500 transition-colors duration-150 overflow-hidden">
            <div className="relative">
                <select
                    value={moneda}
                    onChange={(e) => onChange("moneda", e.target.value)}
                    className="bg-surface-2 border-r border-border-light h-full pl-3 pr-7 font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-secondary)] outline-none cursor-pointer hover:bg-surface-3 transition-colors appearance-none"
                >
                    <option value="VES">Bs.</option>
                    <option value="USD">$</option>
                </select>
                <ChevronDown
                    size={11}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
                />
            </div>
            <input
                type="number"
                step={0.01}
                min={0}
                placeholder="0,00"
                value={salarioMensual}
                onChange={(e) => onChange("salarioMensual", e.target.value)}
                className="flex-1 min-w-0 px-3 bg-transparent outline-none font-mono text-[13px] text-right tabular-nums text-foreground placeholder:text-[var(--text-disabled)]"
            />
        </div>
    );
}

// ── Employee row ─────────────────────────────────────────────────────────────

interface EmployeeRowProps {
    employee:      Employee;
    mode:          RowMode;
    draft:         RowState;
    saving:        boolean;
    selected:      boolean;
    confirmDelete: boolean;
    deleting:      boolean;
    onSelect:        (checked: boolean) => void;
    onDraftChange:   (field: keyof RowState, value: string) => void;
    onEdit:          () => void;
    onSave:          () => void;
    onCancel:        () => void;
    onAskDelete:     () => void;
    onConfirmDelete: () => void;
    onCancelDelete:  () => void;
    onShowHistory:   () => void;
}

function EmployeeRow({
    employee, mode, draft, saving, selected, confirmDelete, deleting,
    onSelect, onDraftChange, onEdit, onSave, onCancel,
    onAskDelete, onConfirmDelete, onCancelDelete, onShowHistory,
}: EmployeeRowProps) {
    const isEditing = mode === "edit";
    const tdCls     = "px-4 py-3 align-middle";

    return (
        <tr className={[
            "border-b border-border-light/60 transition-colors group",
            selected      ? "bg-primary-500/5 hover:bg-primary-500/10"
            : isEditing   ? "bg-primary-500/[0.04]"
                          : "hover:bg-surface-2/60",
        ].join(" ")}>

            {/* Selection */}
            <td className={tdCls + " w-10"}>
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => onSelect(e.target.checked)}
                    disabled={isEditing}
                    className="w-4 h-4 rounded border-border-default text-primary-500 focus:ring-primary-500/20 cursor-pointer disabled:opacity-30"
                    aria-label={`Seleccionar ${employee.nombre}`}
                />
            </td>

            {/* Cédula */}
            <td className={tdCls + " w-32"}>
                {isEditing ? (
                    <input
                        type="text"
                        value={draft.cedula}
                        onChange={(e) => onDraftChange("cedula", e.target.value)}
                        placeholder="V-12345678-9"
                        className={cellInputCls}
                        title="Cambiar la cédula también la actualizará en todos los recibos históricos."
                    />
                ) : (
                    <span className="font-mono text-[13px] text-[var(--text-secondary)] tabular-nums">
                        {employee.cedula}
                    </span>
                )}
            </td>

            {/* Nombre / Cargo */}
            <td className={tdCls}>
                {isEditing ? (
                    <div className="space-y-1.5">
                        <input
                            type="text"
                            value={draft.nombre}
                            onChange={(e) => onDraftChange("nombre", e.target.value)}
                            placeholder="Nombre completo"
                            className={cellInputCls}
                        />
                        <input
                            type="text"
                            value={draft.cargo}
                            onChange={(e) => onDraftChange("cargo", e.target.value)}
                            placeholder="Cargo"
                            className={cellInputCls + " text-[12px]"}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium text-foreground truncate">
                            {employee.nombre}
                        </span>
                        {employee.cargo && (
                            <span className="font-sans text-[12px] text-[var(--text-tertiary)] truncate">
                                {employee.cargo}
                            </span>
                        )}
                    </div>
                )}
            </td>

            {/* Salario / Moneda */}
            <td className={tdCls + " w-48"}>
                {isEditing ? (
                    <MoneySalaryInput
                        moneda={draft.moneda}
                        salarioMensual={draft.salarioMensual}
                        onChange={(f, v) => onDraftChange(f, v)}
                    />
                ) : (
                    <div className="flex items-baseline justify-end gap-2 tabular-nums">
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                            {employee.moneda === "USD" ? "$" : "Bs."}
                        </span>
                        <span className="font-mono text-[14px] font-semibold text-foreground">
                            {fmtMoney(Number(employee.salarioMensual))}
                        </span>
                    </div>
                )}
            </td>

            {/* %ISLR (AR-I) */}
            <td className={tdCls + " w-24"}>
                {isEditing ? (
                    <div className="flex h-9 rounded-lg border border-border-default bg-surface-1 hover:border-border-medium focus-within:border-primary-500 transition-colors duration-150 overflow-hidden">
                        <input
                            type="number"
                            step={0.01}
                            min={0}
                            max={100}
                            placeholder="0"
                            value={draft.porcentajeIslr}
                            onChange={(e) => onDraftChange("porcentajeIslr", e.target.value)}
                            className="flex-1 min-w-0 px-3 bg-transparent outline-none font-mono text-[13px] text-right tabular-nums text-foreground placeholder:text-[var(--text-disabled)]"
                        />
                        <span className="border-l border-border-light px-2 flex items-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] bg-surface-2">%</span>
                    </div>
                ) : (
                    <div className="flex items-baseline justify-end gap-1 tabular-nums">
                        <span className="font-mono text-[13px] text-[var(--text-secondary)]">
                            {Number(employee.porcentajeIslr ?? 0).toFixed(2)}
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">%</span>
                    </div>
                )}
            </td>

            {/* Ingreso / Antigüedad */}
            <td className={tdCls + " w-40"}>
                {isEditing ? (
                    <input
                        type="date"
                        value={draft.fechaIngreso}
                        onChange={(e) => onDraftChange("fechaIngreso", e.target.value)}
                        className={cellInputCls}
                    />
                ) : employee.fechaIngreso ? (
                    <div className="flex flex-col">
                        <span className="font-mono text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                            {fmtDate(employee.fechaIngreso)}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">
                            {calcAntiguedad(employee.fechaIngreso)}
                        </span>
                    </div>
                ) : (
                    <span className="text-[var(--text-disabled)]">—</span>
                )}
            </td>

            {/* Estado */}
            <td className={tdCls + " w-32"}>
                {isEditing ? (
                    <div className="relative">
                        <select
                            value={draft.estado}
                            onChange={(e) => onDraftChange("estado", e.target.value)}
                            className={cellInputCls + " appearance-none pr-8 cursor-pointer"}
                        >
                            {ESTADOS.map((s) => (
                                <option key={s} value={s}>{ESTADO_LABEL[s]}</option>
                            ))}
                        </select>
                        <ChevronDown
                            size={12}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
                        />
                    </div>
                ) : (
                    <StatusBadge estado={employee.estado} />
                )}
            </td>

            {/* Actions */}
            <td className={tdCls + " w-36 text-right"}>
                {saving ? (
                    <div className="flex justify-end pr-2"><Spinner /></div>
                ) : isEditing ? (
                    <div className="flex items-center justify-end gap-1">
                        <button
                            type="button"
                            onClick={onSave}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-success hover:bg-success/10 transition-colors"
                            title="Guardar"
                            aria-label="Guardar"
                        >
                            <Check size={15} strokeWidth={2.4} />
                        </button>
                        <button
                            type="button"
                            onClick={onCancel}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                            title="Cancelar"
                            aria-label="Cancelar"
                        >
                            <X size={15} />
                        </button>
                    </div>
                ) : confirmDelete ? (
                    <div className="flex items-center justify-end gap-2 px-1">
                        <span className="font-sans text-[12px] text-[var(--text-secondary)] hidden sm:inline">
                            ¿Eliminar?
                        </span>
                        <button
                            type="button"
                            onClick={onConfirmDelete}
                            disabled={deleting}
                            className="font-mono text-[11px] uppercase tracking-[0.10em] text-text-error hover:text-error transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {deleting ? "Eliminando…" : "Confirmar"}
                        </button>
                        <button
                            type="button"
                            onClick={onCancelDelete}
                            disabled={deleting}
                            className="font-mono text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-foreground transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-end gap-1">
                        <button
                            type="button"
                            onClick={onShowHistory}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                            title="Historial salarial"
                            aria-label="Historial salarial"
                        >
                            <Clock size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={onEdit}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                            title="Editar"
                            aria-label="Editar"
                        >
                            <Pencil size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={onAskDelete}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-text-error hover:bg-error/10 transition-colors"
                            title="Eliminar"
                            aria-label="Eliminar"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                )}
            </td>
        </tr>
    );
}

// ── New (draft) row ──────────────────────────────────────────────────────────

interface NewRowProps {
    draft:    RowState;
    saving:   boolean;
    onChange: (field: keyof RowState, value: string) => void;
    onSave:   () => void;
    onCancel: () => void;
}

function NewEmployeeRow({ draft, saving, onChange, onSave, onCancel }: NewRowProps) {
    const tdCls = "px-4 py-3 align-middle";
    return (
        <>
            <tr className="border-b border-border-light/60 bg-primary-500/[0.04]">
                <td className={tdCls + " w-10"}>
                    <div className="w-4 h-4 rounded border-2 border-dashed border-primary-500/40 mx-auto" />
                </td>
                <td className={tdCls + " w-32"}>
                    <input
                        type="text"
                        autoFocus
                        placeholder="V-12345678"
                        value={draft.cedula}
                        onChange={(e) => onChange("cedula", e.target.value)}
                        className={cellInputCls}
                    />
                </td>
                <td className={tdCls}>
                    <div className="space-y-1.5">
                        <input
                            type="text"
                            value={draft.nombre}
                            onChange={(e) => onChange("nombre", e.target.value)}
                            placeholder="Nombre completo"
                            className={cellInputCls}
                        />
                        <input
                            type="text"
                            value={draft.cargo}
                            onChange={(e) => onChange("cargo", e.target.value)}
                            placeholder="Cargo"
                            className={cellInputCls + " text-[12px]"}
                        />
                    </div>
                </td>
                <td className={tdCls + " w-48"}>
                    <MoneySalaryInput
                        moneda={draft.moneda}
                        salarioMensual={draft.salarioMensual}
                        onChange={(f, v) => onChange(f, v)}
                    />
                </td>
                <td className={tdCls + " w-24"}>
                    <div className="flex h-9 rounded-lg border border-border-default bg-surface-1 hover:border-border-medium focus-within:border-primary-500 transition-colors duration-150 overflow-hidden">
                        <input
                            type="number"
                            step={0.01}
                            min={0}
                            max={100}
                            placeholder="0"
                            value={draft.porcentajeIslr}
                            onChange={(e) => onChange("porcentajeIslr", e.target.value)}
                            className="flex-1 min-w-0 px-3 bg-transparent outline-none font-mono text-[13px] text-right tabular-nums text-foreground placeholder:text-[var(--text-disabled)]"
                        />
                        <span className="border-l border-border-light px-2 flex items-center font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] bg-surface-2">%</span>
                    </div>
                </td>
                <td className={tdCls + " w-40"}>
                    <input
                        type="date"
                        value={draft.fechaIngreso}
                        onChange={(e) => onChange("fechaIngreso", e.target.value)}
                        className={cellInputCls}
                    />
                </td>
                <td className={tdCls + " w-32"}>
                    <div className="relative">
                        <select
                            value={draft.estado}
                            onChange={(e) => onChange("estado", e.target.value)}
                            className={cellInputCls + " appearance-none pr-8 cursor-pointer"}
                        >
                            {ESTADOS.map((s) => (
                                <option key={s} value={s}>{ESTADO_LABEL[s]}</option>
                            ))}
                        </select>
                        <ChevronDown
                            size={12}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none"
                        />
                    </div>
                </td>
                <td className={tdCls + " w-36 text-right"}>
                    {saving ? (
                        <div className="flex justify-end pr-2"><Spinner /></div>
                    ) : (
                        <div className="flex items-center justify-end gap-1">
                            <button
                                type="button"
                                onClick={onSave}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-success hover:bg-success/10 transition-colors"
                                title="Crear"
                                aria-label="Crear"
                            >
                                <Check size={15} strokeWidth={2.4} />
                            </button>
                            <button
                                type="button"
                                onClick={onCancel}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2 transition-colors"
                                title="Descartar"
                                aria-label="Descartar"
                            >
                                <X size={15} />
                            </button>
                        </div>
                    )}
                </td>
            </tr>
        </>
    );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading, upsert, remove, renameCedula, getSalaryHistory } = useEmployee(companyId);
    const { capacity } = useCapacity();

    const empMax       = capacity?.employeesPerCompany.max ?? null;
    const empUsed      = companyId ? (capacity?.employeesPerCompany.byCompany[companyId] ?? employees.length) : employees.length;
    const empRemaining = empMax === null ? null : Math.max(0, empMax - empUsed);
    const atLimit      = empRemaining === 0;

    // Inline edit state
    const [modes,  setModes]  = useState<Record<string, RowMode>>({});
    const [drafts, setDrafts] = useState<Record<string, RowState>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    // New rows
    const [newRows, setNewRows]           = useState<{ id: string; draft: RowState }[]>([]);
    const [newSaving, setNewSaving]       = useState<Record<string, boolean>>({});
    // Selection
    const [selected, setSelected]               = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting]       = useState(false);
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

    // Per-row delete confirmation
    const [confirmDeleteRow, setConfirmDeleteRow] = useState<string | null>(null);
    const [deletingRow, setDeletingRow]           = useState<string | null>(null);

    // CSV
    const [csvLoading, setCsvLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Paste
    const [pasteOpen, setPasteOpen]           = useState(false);
    const [pasteText, setPasteText]           = useState("");
    const [pasteErrors, setPasteErrors]       = useState<string[]>([]);
    const [pasteCount, setPasteCount]         = useState<number | null>(null);
    const [pasteImporting, setPasteImporting] = useState(false);

    // Salary history
    const [historyModal, setHistoryModal]     = useState<{ cedula: string; nombre: string } | null>(null);
    const [historyData, setHistoryData]       = useState<SalaryHistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Filters
    const [search, setSearch]             = useState("");
    const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");

    // ── Derived ─────────────────────────────────────────────────────────────

    const counts = useMemo(() => ({
        total:    employees.length,
        activo:   employees.filter((e) => e.estado === "activo").length,
        vacacion: employees.filter((e) => e.estado === "vacacion").length,
        inactivo: employees.filter((e) => e.estado === "inactivo").length,
    }), [employees]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return employees.filter((e) => {
            if (estadoFilter !== "todos" && e.estado !== estadoFilter) return false;
            if (!q) return true;
            return e.nombre.toLowerCase().includes(q)
                || e.cedula.toLowerCase().includes(q)
                || e.cargo.toLowerCase().includes(q);
        });
    }, [employees, search, estadoFilter]);

    const hasFilters = search.trim() !== "" || estadoFilter !== "todos";
    const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.cedula));
    const anyEditing  = Object.values(modes).some((m) => m === "edit") || newRows.length > 0;

    // ── Row actions ─────────────────────────────────────────────────────────

    const startEdit = useCallback((emp: Employee) => {
        setModes((m)  => ({ ...m, [emp.cedula]: "edit" }));
        setDrafts((d) => ({ ...d, [emp.cedula]: employeeToRow(emp) }));
    }, []);

    const cancelEdit = useCallback((cedula: string) => {
        setModes((m)  => { const n = { ...m }; delete n[cedula]; return n; });
        setDrafts((d) => { const n = { ...d }; delete n[cedula]; return n; });
    }, []);

    const saveRow = useCallback(async (cedula: string) => {
        const draft = drafts[cedula];
        if (!draft) return;

        const newCedula = draft.cedula.trim();
        if (!newCedula) { notify.error("La cédula no puede estar vacía."); return; }

        const cedulaChanged = newCedula !== cedula;
        if (cedulaChanged) {
            if (employees.some((e) => e.cedula !== cedula && e.cedula === newCedula)) {
                notify.error(`La cédula ${newCedula} ya pertenece a otro empleado.`);
                return;
            }
            const confirmed = window.confirm(
                `Vas a cambiar la cédula de ${draft.nombre || "este empleado"} de "${cedula}" a "${newCedula}".\n\n` +
                "Esto también actualizará la cédula en los recibos de nómina, cesta ticket y el historial salarial. ¿Confirmas?"
            );
            if (!confirmed) return;
        }

        const islrParsed = parseFloat((draft.porcentajeIslr ?? "0").replace(",", "."));
        const islr = Number.isFinite(islrParsed) && islrParsed >= 0 && islrParsed <= 100 ? islrParsed : 0;

        setSaving((s) => ({ ...s, [cedula]: true }));

        if (cedulaChanged) {
            const renamed = await renameCedula(cedula, newCedula);
            if (!renamed) { setSaving((s) => ({ ...s, [cedula]: false })); return; }
        }

        const ok = await upsert([{
            cedula:         newCedula,
            nombre:         draft.nombre.trim(),
            cargo:          draft.cargo.trim(),
            salarioMensual: parseFloat(draft.salarioMensual) || 0,
            moneda:         draft.moneda ?? "VES",
            estado:         draft.estado,
            fechaIngreso:   draft.fechaIngreso || null,
            porcentajeIslr: islr,
        }]);
        setSaving((s) => ({ ...s, [cedula]: false }));
        if (ok) cancelEdit(cedula);
    }, [drafts, employees, upsert, renameCedula, cancelEdit]);

    // ── New row actions ─────────────────────────────────────────────────────

    const addNewRow = useCallback(() => {
        if (atLimit) return;
        const id = `new_${Date.now()}`;
        setNewRows((r) => [{
            id,
            draft: {
                cedula: "", nombre: "", cargo: "",
                salarioMensual: "", moneda: "VES",
                estado: "activo", fechaIngreso: "",
                porcentajeIslr: "0",
            },
        }, ...r]);
    }, [atLimit]);

    const cancelNewRow = useCallback((id: string) => {
        setNewRows((r) => r.filter((n) => n.id !== id));
    }, []);

    const updateNewDraft = useCallback((id: string, field: keyof RowState, value: string) => {
        setNewRows((rows) => rows.map((r) =>
            r.id === id ? { ...r, draft: { ...r.draft, [field]: value } } : r
        ));
    }, []);

    const saveNewRow = useCallback(async (id: string) => {
        const row = newRows.find((r) => r.id === id);
        if (!row) return;
        const { draft } = row;
        const cedula = draft.cedula.trim();

        if (!cedula)                            { notify.error("La cédula es requerida."); return; }
        if (!draft.nombre.trim())               { notify.error("El nombre es requerido."); return; }
        if (employees.some((e) => e.cedula === cedula)) { notify.error(`La cédula ${cedula} ya existe.`); return; }
        const salary = parseFloat(draft.salarioMensual);
        if (!salary || salary <= 0)             { notify.error("El salario debe ser mayor a 0."); return; }

        const islrParsed = parseFloat((draft.porcentajeIslr ?? "0").replace(",", "."));
        const islr = Number.isFinite(islrParsed) && islrParsed >= 0 && islrParsed <= 100 ? islrParsed : 0;

        setNewSaving((s) => ({ ...s, [id]: true }));
        const ok = await upsert([{
            cedula,
            nombre:         draft.nombre.trim(),
            cargo:          draft.cargo.trim(),
            salarioMensual: salary,
            moneda:         draft.moneda ?? "VES",
            estado:         draft.estado,
            fechaIngreso:   draft.fechaIngreso || null,
            porcentajeIslr: islr,
        }]);
        setNewSaving((s) => ({ ...s, [id]: false }));
        if (ok) cancelNewRow(id);
    }, [newRows, employees, upsert, cancelNewRow]);

    // ── Selection ───────────────────────────────────────────────────────────

    const toggleSelect = useCallback((cedula: string, checked: boolean) => {
        setSelected((s) => {
            const n = new Set(s);
            if (checked) n.add(cedula); else n.delete(cedula);
            return n;
        });
    }, []);

    const toggleAll = useCallback((checked: boolean) => {
        setSelected(checked ? new Set(filtered.map((e) => e.cedula)) : new Set());
    }, [filtered]);

    // ── Per-row delete ──────────────────────────────────────────────────────

    const handleRowDelete = useCallback(async (cedula: string) => {
        setDeletingRow(cedula);
        const ok = await remove([cedula]);
        setDeletingRow(null);
        setConfirmDeleteRow(null);
        if (ok) setSelected((s) => { const n = new Set(s); n.delete(cedula); return n; });
    }, [remove]);

    // ── Bulk delete ─────────────────────────────────────────────────────────

    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true);
        const ok = await remove([...selected]);
        setBulkDeleting(false);
        if (ok) { setSelected(new Set()); setConfirmBulkDelete(false); }
    }, [remove, selected]);

    // ── CSV ─────────────────────────────────────────────────────────────────

    const handleExport = useCallback(() => {
        if (!employees.length) return;
        downloadCsv(employeesToCsv(employees), `empleados_${getTodayIsoDate()}.csv`);
    }, [employees]);

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvLoading(true);
        const { employees: parsed, errors } = parseCsv(await file.text());
        if (errors.length > 0) {
            notify.error(errors[0]); setCsvLoading(false); return;
        }
        await upsert(parsed);
        setCsvLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [upsert]);

    // ── Paste ───────────────────────────────────────────────────────────────

    const handlePasteChange = useCallback((text: string) => {
        setPasteText(text);
        if (!text.trim()) { setPasteErrors([]); setPasteCount(null); return; }
        const { employees: parsed, errors } = parseCsv(text);
        setPasteErrors(errors);
        setPasteCount(errors.length === 0 ? parsed.length : null);
    }, []);

    const closePasteModal = useCallback(() => {
        setPasteOpen(false); setPasteText("");
        setPasteErrors([]);  setPasteCount(null);
    }, []);

    const handlePasteImport = useCallback(async () => {
        const { employees: parsed, errors } = parseCsv(pasteText);
        if (errors.length > 0) return;
        setPasteImporting(true);
        const ok = await upsert(parsed);
        setPasteImporting(false);
        if (!ok) return;
        closePasteModal();
    }, [pasteText, upsert, closePasteModal]);

    // ── Salary history ──────────────────────────────────────────────────────

    const openHistory = useCallback(async (emp: Employee) => {
        if (!companyId) return;
        setHistoryModal({ cedula: emp.cedula, nombre: emp.nombre });
        setHistoryData([]); setHistoryLoading(true);
        const history = await getSalaryHistory(companyId, emp.cedula);
        setHistoryLoading(false);
        if (history) setHistoryData(history);
    }, [companyId, getSalaryHistory]);

    const clearFilters = () => { setSearch(""); setEstadoFilter("todos"); };

    // ── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Empleados"
                subtitle={
                    company
                        ? empMax !== null
                            ? `${empUsed} / ${empMax} · ${company.name}`
                            : `${empUsed} empleado${empUsed !== 1 ? "s" : ""} · ${company.name}`
                        : undefined
                }
            >
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={handleExport}
                    isDisabled={employees.length === 0}
                    leftIcon={<Download size={14} />}
                >
                    Exportar
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    isDisabled={csvLoading || atLimit}
                    title={atLimit ? "Límite de empleados alcanzado" : undefined}
                    leftIcon={csvLoading ? <Spinner /> : <Upload size={14} />}
                >
                    Importar CSV
                </BaseButton.Root>
                <input
                    ref={fileInputRef} type="file" accept=".csv"
                    className="sr-only" onChange={handleImport} disabled={atLimit}
                />
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={() => setPasteOpen(true)}
                    isDisabled={atLimit}
                    title={atLimit ? "Límite de empleados alcanzado" : undefined}
                    leftIcon={<ClipboardPaste size={14} />}
                >
                    Pegar CSV
                </BaseButton.Root>
                <BaseButton.Root
                    variant="primary" size="sm"
                    onClick={addNewRow}
                    isDisabled={atLimit}
                    title={atLimit ? "Límite de empleados alcanzado según tu plan" : undefined}
                    leftIcon={<Plus size={14} strokeWidth={2.5} />}
                >
                    Nuevo empleado
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-5">

                {/* KPI strip */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatTile
                        label="Total"
                        value={counts.total}
                        sublabel={empMax !== null ? `Capacidad: ${empMax}` : undefined}
                        icon={Users}
                        tone="primary"
                    />
                    <StatTile
                        label="Activos"
                        value={counts.activo}
                        sublabel={counts.total ? `${Math.round((counts.activo / counts.total) * 100)}% generan recibo` : undefined}
                        icon={UserCheck}
                        tone="success"
                    />
                    <StatTile
                        label="En vacaciones"
                        value={counts.vacacion}
                        icon={Palmtree}
                        tone="warning"
                    />
                    <StatTile
                        label="Inactivos"
                        value={counts.inactivo}
                        icon={UserMinus}
                        tone="muted"
                    />
                </div>

                {/* Limit warning */}
                {atLimit && (
                    <div className="px-4 py-3 rounded-lg border border-warning/30 bg-warning/[0.05] text-text-warning text-[13px] flex items-start gap-3">
                        <AlertTriangle size={16} className="flex-shrink-0 mt-[1px]" />
                        <div className="flex-1">
                            <p className="font-mono text-[12px] uppercase tracking-[0.12em] font-semibold">
                                Capacidad alcanzada
                            </p>
                            <p className="font-sans text-[12px] mt-0.5">
                                Tu plan permite {empMax} empleado{empMax !== 1 ? "s" : ""} por empresa. Elimina o desactiva alguno, o actualiza tu suscripción para agregar más.
                            </p>
                        </div>
                    </div>
                )}


                {/* Toolbar + selection bar */}
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm">
                    <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                        <div className="relative w-full sm:w-80">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, cédula o cargo…"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-default bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500 hover:border-border-medium transition-colors"
                            />
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mr-1 hidden md:inline">
                                Estado
                            </span>
                            <FilterChip active={estadoFilter === "todos"}    onClick={() => setEstadoFilter("todos")}    count={counts.total}>Todos</FilterChip>
                            <FilterChip active={estadoFilter === "activo"}   onClick={() => setEstadoFilter("activo")}   count={counts.activo}>Activos</FilterChip>
                            <FilterChip active={estadoFilter === "vacacion"} onClick={() => setEstadoFilter("vacacion")} count={counts.vacacion}>Vacación</FilterChip>
                            <FilterChip active={estadoFilter === "inactivo"} onClick={() => setEstadoFilter("inactivo")} count={counts.inactivo}>Inactivos</FilterChip>
                        </div>

                        <div className="ml-auto flex items-center gap-3">
                            {hasFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-foreground transition-colors inline-flex items-center gap-1"
                                >
                                    <X size={12} /> Limpiar
                                </button>
                            )}
                            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] tabular-nums">
                                <span className="text-foreground font-semibold">{filtered.length}</span> / {employees.length}
                            </span>
                        </div>
                    </div>

                    <AnimatePresence initial={false}>
                        {selected.size > 0 && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="border-t border-border-light px-4 py-2.5 flex items-center gap-3 bg-surface-2/40">
                                    <span className="font-mono text-[12px] text-foreground">
                                        <span className="font-semibold tabular-nums">{selected.size}</span> seleccionado{selected.size !== 1 ? "s" : ""}
                                    </span>
                                    <span className="text-[var(--text-tertiary)]">·</span>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(new Set())}
                                        className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                    >
                                        Deseleccionar
                                    </button>
                                    <div className="ml-auto">
                                        {confirmBulkDelete ? (
                                            <div className="flex items-center gap-2">
                                                <span className="font-sans text-[12px] text-[var(--text-secondary)]">
                                                    ¿Eliminar {selected.size} empleado{selected.size !== 1 ? "s" : ""}?
                                                </span>
                                                <BaseButton.Root
                                                    variant="danger" size="sm"
                                                    onClick={handleBulkDelete}
                                                    isDisabled={bulkDeleting} loading={bulkDeleting}
                                                >
                                                    {bulkDeleting ? "Eliminando…" : "Confirmar"}
                                                </BaseButton.Root>
                                                <BaseButton.Root
                                                    variant="secondary" size="sm"
                                                    onClick={() => setConfirmBulkDelete(false)}
                                                    isDisabled={bulkDeleting}
                                                >
                                                    Cancelar
                                                </BaseButton.Root>
                                            </div>
                                        ) : (
                                            <BaseButton.Root
                                                variant="dangerOutline" size="sm"
                                                onClick={() => setConfirmBulkDelete(true)}
                                                leftIcon={<Trash2 size={13} />}
                                            >
                                                Eliminar {selected.size}
                                            </BaseButton.Root>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden shadow-sm">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <Loader2 className="animate-spin text-primary-500" size={28} strokeWidth={1.8} />
                            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                Cargando nómina…
                            </span>
                        </div>
                    ) : employees.length === 0 && newRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-8 py-16 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Users size={22} strokeWidth={1.8} />
                            </div>
                            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">Sin empleados</p>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] max-w-[360px]">
                                Crea o importa empleados para comenzar a procesar la nómina quincenal.
                            </p>
                            <BaseButton.Root
                                variant="primary" size="sm"
                                onClick={addNewRow} isDisabled={atLimit}
                                leftIcon={<Plus size={14} strokeWidth={2.5} />}
                            >
                                Nuevo empleado
                            </BaseButton.Root>
                        </div>
                    ) : filtered.length === 0 && newRows.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-8 py-16 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Search size={22} strokeWidth={1.8} />
                            </div>
                            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">Sin resultados</p>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] max-w-[360px]">
                                Ningún empleado coincide con los filtros actuales.
                            </p>
                            {hasFilters && (
                                <BaseButton.Root variant="secondary" size="sm" onClick={clearFilters} leftIcon={<X size={13} />}>
                                    Limpiar filtros
                                </BaseButton.Root>
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px]">
                                <thead>
                                    <tr className="bg-surface-2/40 border-b border-border-light">
                                        <th className="px-4 h-10 w-10">
                                            <input
                                                type="checkbox"
                                                checked={allSelected}
                                                onChange={(e) => toggleAll(e.target.checked)}
                                                disabled={anyEditing || filtered.length === 0}
                                                className="w-4 h-4 rounded border-border-default text-primary-500 focus:ring-primary-500/20 cursor-pointer disabled:opacity-30"
                                                aria-label="Seleccionar todos"
                                            />
                                        </th>
                                        {[
                                            { label: "Cédula",              align: "text-left"  },
                                            { label: "Nombre / Cargo",      align: "text-left"  },
                                            { label: "Salario mensual",     align: "text-right" },
                                            { label: "% ISLR (AR-I)",       align: "text-right" },
                                            { label: "Ingreso / Antigüedad",align: "text-left"  },
                                            { label: "Estado",              align: "text-left"  },
                                            { label: "",                    align: "text-right" },
                                        ].map((h, idx) => (
                                            <th
                                                key={idx}
                                                className={`px-4 h-10 ${h.align} text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-medium whitespace-nowrap`}
                                            >
                                                {h.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <AnimatePresence initial={false}>
                                        {newRows.map((row) => (
                                            <NewEmployeeRow
                                                key={row.id}
                                                draft={row.draft}
                                                saving={newSaving[row.id] ?? false}
                                                onChange={(f, v) => updateNewDraft(row.id, f, v)}
                                                onSave={() => saveNewRow(row.id)}
                                                onCancel={() => cancelNewRow(row.id)}
                                            />
                                        ))}
                                    </AnimatePresence>
                                    {filtered.map((emp) => (
                                        <EmployeeRow
                                            key={emp.cedula}
                                            employee={emp}
                                            mode={modes[emp.cedula] ?? "view"}
                                            draft={drafts[emp.cedula] ?? employeeToRow(emp)}
                                            saving={saving[emp.cedula] ?? false}
                                            selected={selected.has(emp.cedula)}
                                            confirmDelete={confirmDeleteRow === emp.cedula}
                                            deleting={deletingRow === emp.cedula}
                                            onSelect={(checked) => toggleSelect(emp.cedula, checked)}
                                            onDraftChange={(f, v) => setDrafts((d) => ({
                                                ...d,
                                                [emp.cedula]: { ...d[emp.cedula], [f]: v },
                                            }))}
                                            onEdit={() => startEdit(emp)}
                                            onSave={() => saveRow(emp.cedula)}
                                            onCancel={() => cancelEdit(emp.cedula)}
                                            onAskDelete={() => setConfirmDeleteRow(emp.cedula)}
                                            onConfirmDelete={() => handleRowDelete(emp.cedula)}
                                            onCancelDelete={() => setConfirmDeleteRow(null)}
                                            onShowHistory={() => openHistory(emp)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Salary history modal ──────────────────────────────────── */}
            <AnimatePresence>
                {historyModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setHistoryModal(null)}
                            className="absolute inset-0 bg-black/40"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
                            className="relative w-full max-w-md bg-surface-1 border border-border-light rounded-xl shadow-lg overflow-hidden flex flex-col"
                        >
                            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-light bg-surface-2/40">
                                <div className="min-w-0">
                                    <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                        Historial salarial
                                    </h2>
                                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-0.5 truncate">
                                        {historyModal.nombre} · {historyModal.cedula}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setHistoryModal(null)}
                                    className="text-[var(--text-tertiary)] hover:text-foreground transition-colors flex-shrink-0"
                                    aria-label="Cerrar"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="p-5">
                                {historyLoading ? (
                                    <div className="flex flex-col items-center justify-center py-10 gap-3">
                                        <Spinner />
                                        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                                            Consultando…
                                        </span>
                                    </div>
                                ) : historyData.length === 0 ? (
                                    <div className="flex flex-col items-center py-10 gap-2 text-center">
                                        <Clock size={28} strokeWidth={1.5} className="text-[var(--text-tertiary)]" />
                                        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--text-secondary)]">
                                            Sin variaciones registradas
                                        </p>
                                        <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                            El salario no ha cambiado desde el alta del empleado.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="border border-border-light rounded-lg overflow-hidden">
                                        <table className="w-full text-[13px]">
                                            <thead>
                                                <tr className="bg-surface-2/40 border-b border-border-light">
                                                    {["Desde", "Salario", "Mon."].map((h, i) => (
                                                        <th
                                                            key={h}
                                                            className={`px-4 h-9 font-medium text-[11px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] ${i === 1 ? "text-right" : "text-left"}`}
                                                        >
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {historyData.map((entry) => (
                                                    <tr key={entry.id} className="border-b border-border-light/60 last:border-b-0 hover:bg-surface-2/40 transition-colors">
                                                        <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--text-secondary)] whitespace-nowrap">
                                                            {fmtDate(entry.fechaDesde)}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-foreground">
                                                            {fmtMoney(entry.salarioMensual)}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                                                                {entry.moneda === "USD" ? "$" : "Bs."}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end px-5 py-3 border-t border-border-light bg-surface-2/40">
                                <BaseButton.Root variant="secondary" size="sm" onClick={() => setHistoryModal(null)}>
                                    Cerrar
                                </BaseButton.Root>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ── Paste CSV modal ──────────────────────────────────────── */}
            <AnimatePresence>
                {pasteOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={closePasteModal}
                            className="absolute inset-0 bg-black/40"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
                            className="relative w-full max-w-xl bg-surface-1 border border-border-light rounded-xl shadow-lg overflow-hidden flex flex-col"
                        >
                            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-light bg-surface-2/40">
                                <div className="min-w-0">
                                    <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                        Pegar CSV
                                    </h2>
                                    <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-0.5">
                                        La primera fila debe ser el encabezado: cédula, nombre, cargo, salario, estado.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closePasteModal}
                                    className="text-[var(--text-tertiary)] hover:text-foreground transition-colors flex-shrink-0"
                                    aria-label="Cerrar"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="p-5 space-y-3">
                                <pre className="text-[11px] text-[var(--text-secondary)] bg-surface-2 rounded-lg px-3 py-2 border border-border-light select-all overflow-x-auto leading-relaxed">
{`"cedula","nombre","cargo","salario","estado"
"V-12345678","JUAN PEREZ","ANALISTA","1250.50","activo"`}
                                </pre>
                                <textarea
                                    autoFocus
                                    rows={8}
                                    value={pasteText}
                                    onChange={(e) => handlePasteChange(e.target.value)}
                                    placeholder='"cedula","nombre","cargo","salario","estado"'
                                    className="w-full resize-none rounded-lg border border-border-default bg-surface-1 outline-none p-3 font-mono text-[12px] text-foreground leading-relaxed placeholder:text-[var(--text-disabled)] focus:border-primary-500 hover:border-border-medium transition-colors"
                                />

                                {pasteText.trim() && pasteErrors.length === 0 && pasteCount !== null && (
                                    <div className="flex items-center gap-2 text-text-success font-sans text-[12px]">
                                        <Check size={14} />
                                        {pasteCount} empleado{pasteCount !== 1 ? "s" : ""} listo{pasteCount !== 1 ? "s" : ""} para importar.
                                    </div>
                                )}
                                {pasteErrors.length > 0 && (
                                    <ul className="space-y-1 pl-1 border-l-2 border-error/30 ml-1">
                                        {pasteErrors.slice(0, 3).map((e, i) => (
                                            <li key={i} className="font-sans text-[12px] text-text-error pl-3">{e}</li>
                                        ))}
                                        {pasteErrors.length > 3 && (
                                            <li className="font-sans text-[12px] text-[var(--text-tertiary)] pl-3">
                                                …y {pasteErrors.length - 3} error{pasteErrors.length - 3 !== 1 ? "es" : ""} más.
                                            </li>
                                        )}
                                    </ul>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-light bg-surface-2/40">
                                <BaseButton.Root variant="secondary" size="sm" onClick={closePasteModal}>
                                    Cancelar
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="primary" size="sm"
                                    onClick={handlePasteImport}
                                    isDisabled={pasteImporting || pasteErrors.length > 0 || !pasteText.trim() || pasteCount === 0}
                                    loading={pasteImporting}
                                    leftIcon={<ClipboardPaste size={14} />}
                                >
                                    {pasteImporting ? "Importando…" : "Importar"}
                                </BaseButton.Root>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
