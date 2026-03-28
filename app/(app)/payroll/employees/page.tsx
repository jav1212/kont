"use client";

import React, { useState, useCallback, useRef } from "react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee, EmployeeEstado, EmployeeMoneda, SalaryHistoryEntry } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { employeesToCsv, downloadCsv, parseCsv } from "@/src/modules/payroll/frontend/utils/employee-csv";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";

// ============================================================================
// TYPES
// ============================================================================

type RowMode = "view" | "edit" | "new";

interface RowState {
    cedula: string;
    nombre: string;
    cargo: string;
    salarioMensual: string;
    moneda: EmployeeMoneda;
    estado: EmployeeEstado;
    fechaIngreso: string;
}

function employeeToRow(e: Employee): RowState {
    return {
        cedula: e.cedula,
        nombre: e.nombre,
        cargo: e.cargo,
        salarioMensual: String(e.salarioMensual),
        moneda: e.moneda ?? "VES",
        estado: e.estado,
        fechaIngreso: e.fechaIngreso ?? "",
    };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function calcAntiguedad(fechaIngreso: string | null | undefined): string {
    if (!fechaIngreso) return "—";
    const start = new Date(fechaIngreso);
    const now = new Date();
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    if (months < 0) { years--; months += 12; }
    if (years === 0 && months === 0) return "< 1 mes";
    const parts: string[] = [];
    if (years > 0) parts.push(`${years}a`);
    if (months > 0) parts.push(`${months}m`);
    return parts.join(" ");
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ESTADOS: EmployeeEstado[] = ["activo", "inactivo", "vacacion"];

const ESTADO_CLS: Record<EmployeeEstado, string> = {
    activo: "border badge-success",
    inactivo: "border badge-error",
    vacacion: "border badge-warning",
};

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

const cellInput = [
    "w-full h-8 px-2 rounded-lg border bg-surface-1 outline-none",
    "font-mono text-[12px] text-foreground tabular-nums",
    "border-border-light focus:border-primary-500/60 focus:bg-surface-1",
    "hover:border-border-medium transition-colors duration-150",
].join(" ");

const Spinner = () => (
    <svg className="animate-spin text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <path d="M11 6A5 5 0 0 0 6 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const IconEdit = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 1.5l2.5 2.5L4 11.5H1.5V9L9 1.5z" />
    </svg>
);
const IconSave = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 7l3.5 3.5L11 3" />
    </svg>
);
const IconCancel = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 2l9 9M11 2l-9 9" />
    </svg>
);
const IconTrash = () => (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3.5h9M4.5 3.5V2.5h4v1M5 6v4M8 6v4M3 3.5l.5 7h6l.5-7" />
    </svg>
);
const IconPlus = () => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M6 1v10M1 6h10" />
    </svg>
);

// Compact secondary toolbar button — shared via APP_SIZES.button.toolbarBtn.
// Applied directly as className when the element must be a <label> (file input trigger).
const toolbarBtn = APP_SIZES.button.toolbarBtn;

// ============================================================================
// EMPLOYEE ROW
// ============================================================================

function EmployeeRow({
    employee, mode, draft, saving, selected,
    onSelect, onDraftChange, onEdit, onSave, onCancel, onDelete, onShowHistory,
}: {
    employee: Employee;
    mode: RowMode;
    draft: RowState;
    saving: boolean;
    selected: boolean;
    onSelect: (checked: boolean) => void;
    onDraftChange: (field: keyof RowState, value: string) => void;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onDelete: () => void;
    onShowHistory: () => void;
}) {
    const isEditing = mode === "edit" || mode === "new";
    const tdCls = "px-3 py-2.5 border-b border-border-light/60 last:border-b-0";

    return (
        <tr className={["transition-colors duration-100 group", selected ? "bg-primary-500/[0.04]" : "hover:bg-foreground/[0.02]"].join(" ")}>

            {/* Checkbox */}
            <td className={tdCls + " w-10 text-center"}>
                <input type="checkbox" checked={selected}
                    onChange={(e) => onSelect(e.target.checked)} disabled={isEditing}
                    className="w-3.5 h-3.5 rounded accent-primary-500 cursor-pointer disabled:opacity-30" />
            </td>

            {/* Cédula */}
            <td className={tdCls + " w-28"}>
                {mode === "new" ? (
                    <input className={cellInput} placeholder="V-12345678"
                        value={draft.cedula} onChange={(e) => onDraftChange("cedula", e.target.value)} />
                ) : (
                    <span className="font-mono text-[13px] text-[var(--text-secondary)] uppercase tracking-wider">{employee.cedula}</span>
                )}
            </td>

            {/* Nombre */}
            <td className={tdCls}>
                {isEditing ? (
                    <input className={cellInput} placeholder="Nombre completo"
                        value={draft.nombre} onChange={(e) => onDraftChange("nombre", e.target.value)} />
                ) : (
                    <span className="font-mono text-[14px] font-medium text-foreground">{employee.nombre}</span>
                )}
            </td>

            {/* Cargo */}
            <td className={tdCls + " w-40"}>
                {isEditing ? (
                    <input className={cellInput} placeholder="Cargo"
                        value={draft.cargo} onChange={(e) => onDraftChange("cargo", e.target.value)} />
                ) : (
                    <span className="font-mono text-[13px] text-[var(--text-secondary)] uppercase tracking-[0.08em]">{employee.cargo}</span>
                )}
            </td>

            {/* Salario + Moneda */}
            <td className={tdCls + " w-52"}>
                {isEditing ? (
                    <div className="flex h-8 rounded-lg border border-border-light focus-within:border-primary-500/60 hover:border-border-medium overflow-hidden transition-colors duration-150">
                        <select
                            className="bg-surface-2 border-r border-border-light px-1.5 font-mono text-[12px] text-[var(--text-secondary)] outline-none cursor-pointer hover:bg-surface-1 transition-colors"
                            value={draft.moneda}
                            onChange={(e) => onDraftChange("moneda", e.target.value)}>
                            <option value="VES">VES</option>
                            <option value="USD">USD</option>
                        </select>
                        <input
                            className="flex-1 min-w-0 bg-surface-1 px-2 font-mono text-[13px] text-right tabular-nums text-foreground outline-none"
                            type="number" step="0.01" min="0" placeholder="0.00"
                            value={draft.salarioMensual} onChange={(e) => onDraftChange("salarioMensual", e.target.value)} />
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[14px] tabular-nums text-[var(--text-primary)]">
                            {Number(employee.salarioMensual).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                        </span>
                        <span className={[
                            "font-mono text-[11px] px-1 py-0.5 rounded border uppercase tracking-widest",
                            employee.moneda === "USD"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                                : "border-border-light text-[var(--text-tertiary)]",
                        ].join(" ")}>
                            {employee.moneda ?? "VES"}
                        </span>
                    </div>
                )}
            </td>

            {/* Fecha de ingreso */}
            <td className={tdCls + " w-32"}>
                {isEditing ? (
                    <input className={cellInput} type="date"
                        value={draft.fechaIngreso}
                        onChange={(e) => onDraftChange("fechaIngreso", e.target.value)} />
                ) : (
                    <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-[13px] text-[var(--text-secondary)]">
                            {employee.fechaIngreso
                                ? new Date(employee.fechaIngreso + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" })
                                : <span className="text-[var(--text-disabled)]">—</span>}
                        </span>
                        {employee.fechaIngreso && (
                            <span className="font-mono text-[12px] text-[var(--text-tertiary)] uppercase tracking-widest">
                                {calcAntiguedad(employee.fechaIngreso)}
                            </span>
                        )}
                    </div>
                )}
            </td>

            {/* Estado */}
            <td className={tdCls + " w-28"}>
                {isEditing ? (
                    <select value={draft.estado} onChange={(e) => onDraftChange("estado", e.target.value)} className={cellInput}>
                        {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                ) : (
                    <span className={["inline-flex px-2 py-0.5 rounded-md border font-mono text-[11px] uppercase tracking-[0.14em]", ESTADO_CLS[employee.estado]].join(" ")}>
                        {employee.estado}
                    </span>
                )}
            </td>

            {/* Actions */}
            <td className={tdCls + " w-28 text-right pr-4"}>
                {saving ? (
                    <div className="flex justify-end"><Spinner /></div>
                ) : isEditing ? (
                    <div className="flex items-center justify-end gap-1">
                        <button onClick={onSave} title="Guardar"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-green-500 hover:bg-green-500/10 transition-colors">
                            <IconSave />
                        </button>
                        <button onClick={onCancel} title="Cancelar"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-foreground/[0.06] transition-colors">
                            <IconCancel />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={onShowHistory} title="Historial de salario"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-primary-500 hover:bg-primary-500/10 transition-colors">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="6" cy="6" r="5" /><path d="M6 3v3l2 1.5" />
                            </svg>
                        </button>
                        <button onClick={onEdit} title="Editar"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground hover:bg-foreground/[0.06] transition-colors">
                            <IconEdit />
                        </button>
                        <button onClick={onDelete} title="Eliminar"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/[0.08] transition-colors">
                            <IconTrash />
                        </button>
                    </div>
                )}
            </td>
        </tr>
    );
}

// ============================================================================
// PAGE
// ============================================================================

export default function EmployeesPage() {
    const { companyId, company } = useCompany();
    const { employees, loading, error, upsert, remove, getSalaryHistory } = useEmployee(companyId);
    const { canAddEmployee, employeesRemaining } = useCapacity();
    const atEmployeeLimit = companyId ? !canAddEmployee(companyId) : false;
    const empRemaining = companyId ? employeesRemaining(companyId) : null;

    // ── Row state ──────────────────────────────────────────────────────────
    const [modes, setModes] = useState<Record<string, RowMode>>({});
    const [drafts, setDrafts] = useState<Record<string, RowState>>({});
    const [saving, setSaving] = useState<Record<string, boolean>>({});
    const [, setRowError] = useState<Record<string, string>>({});

    // ── New rows ───────────────────────────────────────────────────────────
    const [newRows, setNewRows] = useState<{ id: string; draft: RowState }[]>([]);
    const [newSaving, setNewSaving] = useState<Record<string, boolean>>({});
    const [newRowError, setNewRowError] = useState<Record<string, string>>({});

    // ── Selection ─────────────────────────────────────────────────────────
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // ── Bulk actions state ─────────────────────────────────────────────────
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkError, setBulkError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // ── CSV ───────────────────────────────────────────────────────────────
    const [csvLoading, setCsvLoading] = useState(false);
    const [csvError, setCsvError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Paste modal state ──────────────────────────────────────────────────
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState("");
    const [pasteErrors, setPasteErrors] = useState<string[]>([]);
    const [pasteCount, setPasteCount] = useState<number | null>(null);
    const [pasteImporting, setPasteImporting] = useState(false);

    // ── Salary history modal ───────────────────────────────────────────────
    const [historyModal, setHistoryModal] = useState<{ cedula: string; nombre: string } | null>(null);
    const [historyData, setHistoryData] = useState<SalaryHistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);

    const openHistory = useCallback(async (emp: Employee) => {
        if (!companyId) return;
        setHistoryModal({ cedula: emp.cedula, nombre: emp.nombre });
        setHistoryData([]); setHistoryError(null); setHistoryLoading(true);
        const { history, error: err } = await getSalaryHistory(companyId, emp.cedula);
        setHistoryLoading(false);
        if (err) setHistoryError(err);
        else setHistoryData(history);
    }, [companyId, getSalaryHistory]);

    // ── Search ─────────────────────────────────────────────────────────────
    const [search, setSearch] = useState("");

    // ── Filtered employees ─────────────────────────────────────────────────
    const filtered = employees.filter((e) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return e.nombre.toLowerCase().includes(q)
            || e.cedula.toLowerCase().includes(q)
            || e.cargo.toLowerCase().includes(q);
    });

    // ── Row actions ────────────────────────────────────────────────────────

    const startEdit = useCallback((emp: Employee) => {
        setModes((m) => ({ ...m, [emp.cedula]: "edit" }));
        setDrafts((d) => ({ ...d, [emp.cedula]: employeeToRow(emp) }));
        setRowError((e) => ({ ...e, [emp.cedula]: "" }));
    }, []);

    const cancelEdit = useCallback((cedula: string) => {
        setModes((m) => { const n = { ...m }; delete n[cedula]; return n; });
        setDrafts((d) => { const n = { ...d }; delete n[cedula]; return n; });
    }, []);

    const saveRow = useCallback(async (cedula: string) => {
        const draft = drafts[cedula];
        if (!draft) return;

        setSaving((s) => ({ ...s, [cedula]: true }));
        const err = await upsert([{
            cedula: draft.cedula,
            nombre: draft.nombre.trim(),
            cargo: draft.cargo.trim(),
            salarioMensual: parseFloat(draft.salarioMensual) || 0,
            moneda: draft.moneda ?? "VES",
            estado: draft.estado,
            fechaIngreso: draft.fechaIngreso || null,
        }]);
        setSaving((s) => ({ ...s, [cedula]: false }));

        if (err) setRowError((e) => ({ ...e, [cedula]: err }));
        else cancelEdit(cedula);
    }, [drafts, upsert, cancelEdit]);

    // ── New row actions ────────────────────────────────────────────────────

    const addNewRow = useCallback(() => {
        const id = `new_${Date.now()}`;
        setNewRows((r) => [{
            id,
            draft: { cedula: "", nombre: "", cargo: "", salarioMensual: "", moneda: "VES", estado: "activo", fechaIngreso: "" },
        }, ...r]);
    }, []);

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
        if (!cedula) return;
        if (!draft.nombre.trim()) return;

        // Check duplicate cédula
        if (employees.some((e) => e.cedula === cedula)) {
            setNewRowError((s) => ({ ...s, [id]: `La cédula ${cedula} ya existe.` }));
            return;
        }

        const salary = parseFloat(draft.salarioMensual);
        if (!salary || salary <= 0) {
            setNewRowError((s) => ({ ...s, [id]: "El salario debe ser mayor a 0." }));
            return;
        }

        setNewRowError((s) => ({ ...s, [id]: "" }));
        setNewSaving((s) => ({ ...s, [id]: true }));
        const err = await upsert([{
            cedula,
            nombre: draft.nombre.trim(),
            cargo: draft.cargo.trim(),
            salarioMensual: salary,
            moneda: draft.moneda ?? "VES",
            estado: draft.estado,
            fechaIngreso: draft.fechaIngreso || null,
        }]);
        setNewSaving((s) => ({ ...s, [id]: false }));

        if (err) {
            setNewRowError((s) => ({ ...s, [id]: err }));
        } else {
            cancelNewRow(id);
        }
    }, [newRows, employees, upsert, cancelNewRow]);

    // ── Selection ─────────────────────────────────────────────────────────

    const toggleSelect = useCallback((cedula: string, checked: boolean) => {
        setSelected((s) => {
            const n = new Set(s);
            if (checked) n.add(cedula);
            else n.delete(cedula);
            return n;
        });
    }, []);

    const toggleAll = useCallback((checked: boolean) => {
        setSelected(checked ? new Set(filtered.map((e) => e.cedula)) : new Set());
    }, [filtered]);

    // ── Bulk delete ────────────────────────────────────────────────────────

    const handleBulkDelete = useCallback(async () => {
        setBulkDeleting(true);
        setBulkError(null);
        const err = await remove([...selected]);
        setBulkDeleting(false);
        if (err) setBulkError(err);
        else { setSelected(new Set()); setConfirmDelete(false); }
    }, [remove, selected]);

    // ── CSV ───────────────────────────────────────────────────────────────

    const handleExport = useCallback(() => {
        if (!employees.length) return;
        downloadCsv(employeesToCsv(employees), `empleados_${new Date().toISOString().split("T")[0]}.csv`);
    }, [employees]);

    const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCsvError(null); setCsvLoading(true);
        const { employees: parsed, errors } = parseCsv(await file.text());
        if (errors.length > 0) { setCsvError(errors[0]); setCsvLoading(false); return; }
        const err = await upsert(parsed);
        if (err) setCsvError(err);
        setCsvLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [upsert]);

    // ── Paste modal ────────────────────────────────────────────────────────

    const handlePasteChange = useCallback((text: string) => {
        setPasteText(text);
        if (!text.trim()) { setPasteErrors([]); setPasteCount(null); return; }
        const { employees: parsed, errors } = parseCsv(text);
        setPasteErrors(errors);
        setPasteCount(errors.length === 0 ? parsed.length : null);
    }, []);

    const handlePasteImport = useCallback(async () => {
        const { employees: parsed, errors } = parseCsv(pasteText);
        if (errors.length > 0) return;
        setPasteImporting(true);
        const err = await upsert(parsed);
        setPasteImporting(false);
        if (err) { setPasteErrors([err]); return; }
        setPasteOpen(false);
        setPasteText("");
        setPasteErrors([]);
        setPasteCount(null);
    }, [pasteText, upsert]);

    const closePasteModal = useCallback(() => {
        setPasteOpen(false);
        setPasteText("");
        setPasteErrors([]);
        setPasteCount(null);
    }, []);

    // ── Render ─────────────────────────────────────────────────────────────

    const allSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.cedula));
    const anyEditing = Object.values(modes).some((m) => m === "edit") || newRows.length > 0;

    return (
        <div className="min-h-full bg-surface-2 p-4 sm:p-8 font-mono">
            <div className="max-w-[1100px] mx-auto space-y-5">

                {/* Header */}
                <header className="pb-4 border-b border-border-light">

                    <div className="flex items-end justify-between gap-4 flex-wrap">
                        <div>
                            <h1 className="font-mono text-[22px] font-black uppercase tracking-tighter text-foreground leading-none">
                                Empleados
                            </h1>
                            {company && (
                                <p className="font-mono text-[10px] text-[var(--text-tertiary)] mt-1.5 uppercase tracking-[0.18em]">
                                    {company.name} · {empRemaining !== null
                                        ? `${employees.length} / ${employees.length + empRemaining} empleado${employees.length + empRemaining !== 1 ? "s" : ""}`
                                        : `${employees.length} empleado${employees.length !== 1 ? "s" : ""}`
                                    }
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={handleExport} disabled={employees.length === 0} className={toolbarBtn}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 1v7M3 6l3 3 3-3M2 10h8" />
                                </svg>
                                Exportar CSV
                            </button>
                            <label className={[toolbarBtn, "cursor-pointer", (csvLoading || atEmployeeLimit) ? "opacity-40 pointer-events-none" : ""].join(" ")}
                                title={atEmployeeLimit ? "Límite de empleados alcanzado" : undefined}>
                                {csvLoading ? <Spinner /> : (
                                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M6 8V1M3 4l3-3 3 3M2 10h8" />
                                    </svg>
                                )}
                                Importar CSV
                                <input ref={fileInputRef} type="file" accept=".csv" className="sr-only" onChange={handleImport} disabled={atEmployeeLimit} />
                            </label>
                            <button onClick={() => setPasteOpen(true)} disabled={atEmployeeLimit}
                                title={atEmployeeLimit ? "Límite de empleados alcanzado" : undefined}
                                className={toolbarBtn}>
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="2" y="3" width="8" height="8" rx="1" />
                                    <path d="M4 1h4v2H4z" />
                                </svg>
                                Pegar CSV
                            </button>
                            <BaseButton.Root
                                variant="primary"
                                size="sm"
                                onClick={addNewRow}
                                isDisabled={atEmployeeLimit}
                                title={atEmployeeLimit ? "Límite de empleados alcanzado según tu plan" : undefined}
                                leftIcon={<IconPlus />}
                            >
                                Nuevo empleado
                            </BaseButton.Root>
                        </div>
                    </div>
                </header>

                {/* Errors */}
                {(csvError || bulkError) && (
                    <div className="px-3 py-2 border border-red-500/20 rounded-lg bg-red-500/[0.05]">
                        <p className="font-mono text-[12px] text-red-500">{csvError ?? bulkError}</p>
                    </div>
                )}

                {/* Bulk action bar */}
                {selected.size > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-primary-500/20 bg-primary-500/[0.05]">
                        <span className="font-mono text-[13px] text-primary-500">
                            {selected.size} empleado{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelected(new Set())}
                                className="font-mono text-[12px] uppercase tracking-widest text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                            >
                                Deseleccionar
                            </button>
                            {confirmDelete ? (
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[12px] text-red-500">¿Confirmar eliminación?</span>
                                    <button
                                        onClick={handleBulkDelete}
                                        disabled={bulkDeleting}
                                        className="h-7 px-3 rounded-lg bg-red-500 text-white font-mono text-[12px] uppercase tracking-widest hover:bg-red-600 disabled:opacity-50 transition-colors"
                                    >
                                        {bulkDeleting ? "Eliminando…" : "Sí, eliminar"}
                                    </button>
                                    <button
                                        onClick={() => setConfirmDelete(false)}
                                        className="h-7 px-3 rounded-lg border border-border-light font-mono text-[12px] uppercase tracking-widest text-[var(--text-secondary)] hover:text-foreground transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmDelete(true)}
                                    className="h-7 px-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] text-red-500 font-mono text-[12px] uppercase tracking-widest hover:bg-red-500/[0.14] transition-colors flex items-center gap-1.5"
                                >
                                    <IconTrash />
                                    Eliminar selección
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center h-32 border border-border-light rounded-xl">
                        <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
                            <Spinner />
                            <span className="font-mono text-[13px] uppercase tracking-widest">Cargando empleados…</span>
                        </div>
                    </div>
                ) : error ? (
                    <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/[0.05]">
                        <p className="font-mono text-[13px] text-red-500">{error}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Search */}
                        <div className="relative">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="5.5" cy="5.5" r="4" /><path d="M10.5 10.5l-2.5-2.5" />
                            </svg>
                            <input
                                type="text"
                                placeholder="Buscar por nombre, cédula o cargo…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className={[
                                    "w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none",
                                    "font-mono text-[14px] text-foreground placeholder:text-[var(--text-disabled)]",
                                    "focus:border-primary-500/50 hover:border-border-medium transition-colors duration-150",
                                ].join(" ")}
                            />
                        </div>

                        <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            <th className="px-3 py-2.5 w-10 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={(e) => toggleAll(e.target.checked)}
                                                    disabled={anyEditing || filtered.length === 0}
                                                    className="w-3.5 h-3.5 rounded accent-primary-500 cursor-pointer disabled:opacity-30"
                                                />
                                            </th>
                                            {["Cédula", "Nombre", "Cargo", "Salario / Moneda", "Ingreso / Antigüedad", "Estado", ""].map((h) => (
                                                <th key={h} className={[
                                                    "px-3 py-2.5 text-left font-mono uppercase text-[var(--text-tertiary)] whitespace-nowrap",
                                                    APP_SIZES.text.tableHeader
                                                ].join(" ")}>
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* New rows */}
                                        {newRows.map((row) => (
                                            <React.Fragment key={row.id}>
                                                <tr className="bg-primary-500/[0.03] border-b border-border-light/60">
                                                    <td className="px-3 py-2.5 w-10 text-center">
                                                        <div className="w-3.5 h-3.5 rounded border border-border-medium opacity-30 mx-auto" />
                                                    </td>
                                                    <td className="px-3 py-2.5 w-28">
                                                        <input className={cellInput} placeholder="V-12345678"
                                                            value={row.draft.cedula}
                                                            onChange={(e) => updateNewDraft(row.id, "cedula", e.target.value)} />
                                                    </td>
                                                    <td className="px-3 py-2.5">
                                                        <input className={cellInput} placeholder="Nombre completo"
                                                            value={row.draft.nombre}
                                                            onChange={(e) => updateNewDraft(row.id, "nombre", e.target.value)} />
                                                    </td>
                                                    <td className="px-3 py-2.5 w-40">
                                                        <input className={cellInput} placeholder="Cargo"
                                                            value={row.draft.cargo}
                                                            onChange={(e) => updateNewDraft(row.id, "cargo", e.target.value)} />
                                                    </td>
                                                    <td className="px-3 py-2.5 w-52">
                                                        <div className="flex h-8 rounded-lg border border-border-light focus-within:border-primary-500/60 hover:border-border-medium overflow-hidden transition-colors duration-150">
                                                            <select
                                                                className="bg-surface-2 border-r border-border-light px-1.5 font-mono text-[12px] text-[var(--text-secondary)] outline-none cursor-pointer hover:bg-surface-1 transition-colors"
                                                                value={row.draft.moneda}
                                                                onChange={(e) => updateNewDraft(row.id, "moneda", e.target.value)}>
                                                                <option value="VES">VES</option>
                                                                <option value="USD">USD</option>
                                                            </select>
                                                            <input
                                                                className="flex-1 min-w-0 bg-surface-1 px-2 font-mono text-[13px] text-right tabular-nums text-foreground outline-none"
                                                                type="number" step="0.01" min="0" placeholder="0.00"
                                                                value={row.draft.salarioMensual}
                                                                onChange={(e) => updateNewDraft(row.id, "salarioMensual", e.target.value)} />
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2.5 w-32">
                                                        <input className={cellInput} type="date"
                                                            value={row.draft.fechaIngreso}
                                                            onChange={(e) => updateNewDraft(row.id, "fechaIngreso", e.target.value)} />
                                                    </td>
                                                    <td className="px-3 py-2.5 w-28">
                                                        <select className={cellInput} value={row.draft.estado}
                                                            onChange={(e) => updateNewDraft(row.id, "estado", e.target.value)}>
                                                            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="px-3 py-2.5 w-24 text-right pr-4">
                                                        {newSaving[row.id] ? (
                                                            <div className="flex justify-end"><Spinner /></div>
                                                        ) : (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <button onClick={() => saveNewRow(row.id)} title="Guardar"
                                                                    className="w-7 h-7 flex items-center justify-center rounded-md text-green-500 hover:bg-green-500/10 transition-colors">
                                                                    <IconSave />
                                                                </button>
                                                                <button onClick={() => cancelNewRow(row.id)} title="Cancelar"
                                                                    className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-foreground/[0.06] transition-colors">
                                                                    <IconCancel />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                                {newRowError[row.id] && (
                                                    <tr className="bg-red-500/[0.04]">
                                                        <td colSpan={7} className="px-4 py-1.5">
                                                            <p className="font-mono text-[12px] text-red-400">{newRowError[row.id]}</p>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}

                                        {/* Existing rows */}
                                        {filtered.length === 0 && newRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-4 py-12 text-center font-mono text-[13px] text-[var(--text-disabled)] uppercase tracking-widest">
                                                    {employees.length === 0
                                                        ? "Sin empleados. Importa un CSV o agrega uno manualmente."
                                                        : "Sin resultados para la búsqueda."}
                                                </td>
                                            </tr>
                                        ) : (
                                            filtered.map((emp) => (
                                                <EmployeeRow
                                                    key={emp.cedula}
                                                    employee={emp}
                                                    mode={modes[emp.cedula] ?? "view"}
                                                    draft={drafts[emp.cedula] ?? employeeToRow(emp)}
                                                    saving={saving[emp.cedula] ?? false}
                                                    selected={selected.has(emp.cedula)}
                                                    onSelect={(checked) => toggleSelect(emp.cedula, checked)}
                                                    onDraftChange={(f, v) => setDrafts((d) => ({
                                                        ...d,
                                                        [emp.cedula]: { ...d[emp.cedula], [f]: v },
                                                    }))}
                                                    onEdit={() => startEdit(emp)}
                                                    onSave={() => saveRow(emp.cedula)}
                                                    onCancel={() => cancelEdit(emp.cedula)}
                                                    onDelete={() => { toggleSelect(emp.cedula, true); setConfirmDelete(true); }}
                                                    onShowHistory={() => openHistory(emp)}
                                                />
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* ── Salary History Modal ────────────────────────────────────────── */}
            {historyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                            <div>
                                <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.15em] text-foreground">
                                    Historial de Salario
                                </h2>
                                <p className="font-mono text-[11px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-widest">
                                    {historyModal.nombre} · {historyModal.cedula}
                                </p>
                            </div>
                            <button onClick={() => setHistoryModal(null)}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground hover:bg-foreground/[0.06] transition-colors">
                                <IconCancel />
                            </button>
                        </div>
                        <div className="p-5">
                            {historyLoading ? (
                                <div className="flex items-center justify-center h-24 gap-2 text-[var(--text-tertiary)]">
                                    <Spinner />
                                    <span className="font-mono text-[13px] uppercase tracking-widest">Cargando…</span>
                                </div>
                            ) : historyError ? (
                                <p className="font-mono text-[13px] text-red-500">{historyError}</p>
                            ) : historyData.length === 0 ? (
                                <p className="font-mono text-[13px] text-[var(--text-tertiary)] text-center py-6 uppercase tracking-widest">Sin historial registrado.</p>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {["Desde", "Salario", "Moneda"].map((h) => (
                                                <th key={h} className="pb-2 text-left font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyData.map((entry) => (
                                            <tr key={entry.id} className="border-b border-border-light/50 last:border-0">
                                                <td className="py-2 font-mono text-[13px] text-[var(--text-secondary)]">{entry.fechaDesde}</td>
                                                <td className="py-2 font-mono text-[13px] text-foreground">
                                                    {entry.salarioMensual.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="py-2">
                                                    <span className={[
                                                        "font-mono text-[11px] uppercase tracking-widest px-1.5 py-0.5 rounded",
                                                        entry.moneda === "USD"
                                                            ? "bg-green-500/10 text-green-500"
                                                            : "bg-foreground/[0.06] text-[var(--text-secondary)]",
                                                    ].join(" ")}>
                                                        {entry.moneda}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div className="flex justify-end px-5 py-4 border-t border-border-light">
                            <button onClick={() => setHistoryModal(null)}
                                className="h-8 px-4 rounded-lg border border-border-light font-mono text-[12px] uppercase tracking-widest text-[var(--text-secondary)] hover:text-foreground hover:border-border-medium transition-colors">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Paste CSV Modal ─────────────────────────────────────────────── */}
            {pasteOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden">

                        {/* Modal header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
                            <div>
                                <h2 className="font-mono text-[13px] font-bold uppercase tracking-[0.15em] text-foreground">
                                    Pegar CSV
                                </h2>
                                <p className="font-mono text-[11px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-widest">
                                    Empleados · columnas: cedula, nombre, cargo, salario_mensual_ves, estado
                                </p>
                            </div>
                            <button onClick={closePasteModal}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground hover:bg-foreground/[0.06] transition-colors">
                                <IconCancel />
                            </button>
                        </div>

                        {/* Textarea */}
                        <div className="p-5 space-y-3">
                            <textarea
                                autoFocus
                                rows={10}
                                value={pasteText}
                                onChange={(e) => handlePasteChange(e.target.value)}
                                placeholder={`"cedula","nombre","cargo","salario_mensual_ves","estado"\n"V-12345678","JUAN PEREZ","ANALISTA","100000","activo"`}
                                className={[
                                    "w-full resize-none rounded-lg border bg-surface-2 outline-none p-3",
                                    "font-mono text-[13px] text-foreground leading-relaxed",
                                    "border-border-light focus:border-primary-500/60 hover:border-border-medium",
                                    "transition-colors duration-150 placeholder:text-[var(--text-disabled)]",
                                ].join(" ")}
                            />

                            {/* Validation feedback */}
                            {pasteText.trim() && pasteErrors.length === 0 && pasteCount !== null && (
                                <p className="font-mono text-[12px] text-green-500">
                                    {pasteCount} empleado{pasteCount !== 1 ? "s" : ""} listo{pasteCount !== 1 ? "s" : ""} para importar.
                                </p>
                            )}
                            {pasteErrors.length > 0 && (
                                <div className="space-y-1">
                                    {pasteErrors.slice(0, 3).map((e, i) => (
                                        <p key={i} className="font-mono text-[12px] text-red-500">{e}</p>
                                    ))}
                                    {pasteErrors.length > 3 && (
                                        <p className="font-mono text-[12px] text-[var(--text-tertiary)]">…y {pasteErrors.length - 3} error(es) más.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-light">
                            <button onClick={closePasteModal}
                                className="h-8 px-4 rounded-lg border border-border-light font-mono text-[12px] uppercase tracking-widest text-[var(--text-secondary)] hover:text-foreground hover:border-border-medium transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handlePasteImport}
                                disabled={pasteImporting || pasteErrors.length > 0 || !pasteText.trim() || pasteCount === 0}
                                className={[
                                    "h-8 px-4 rounded-lg font-mono text-[12px] uppercase tracking-widest",
                                    "bg-primary-500 text-white hover:bg-primary-600",
                                    "disabled:opacity-40 disabled:cursor-not-allowed transition-colors",
                                    "flex items-center gap-2",
                                ].join(" ")}
                            >
                                {pasteImporting && <Spinner />}
                                {pasteImporting ? "Importando…" : "Importar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
