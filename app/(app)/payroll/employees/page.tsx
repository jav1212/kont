"use client";

import React, { useState, useCallback, useRef } from "react";
import { useCompany }  from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee, EmployeeEstado } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { employeesToCsv, downloadCsv, parseCsv } from "@/src/modules/payroll/frontend/utils/employee-csv";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";

// ============================================================================
// TYPES
// ============================================================================

type RowMode = "view" | "edit" | "new";

interface RowState {
    cedula:         string;
    nombre:         string;
    cargo:          string;
    salarioMensual: string;
    estado:         EmployeeEstado;
}

function employeeToRow(e: Employee): RowState {
    return {
        cedula:         e.cedula,
        nombre:         e.nombre,
        cargo:          e.cargo,
        salarioMensual: String(e.salarioMensual),
        estado:         e.estado,
    };
}

// ============================================================================
// CONSTANTS
// ============================================================================

const ESTADOS: EmployeeEstado[] = ["activo", "inactivo", "vacacion"];

const ESTADO_CLS: Record<EmployeeEstado, string> = {
    activo:   "border-green-500/20 bg-green-500/[0.08] text-green-600 dark:text-green-400",
    inactivo: "border-red-500/20 bg-red-500/[0.08] text-red-600 dark:text-red-400",
    vacacion: "border-amber-500/20 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400",
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
    <svg className="animate-spin text-foreground/30" width="13" height="13" viewBox="0 0 12 12" fill="none">
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

const toolbarBtn = [
    "h-8 px-3 rounded-lg flex items-center gap-1.5 border border-border-light bg-surface-1",
    "hover:border-border-medium hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed",
    "font-mono text-[10px] uppercase tracking-[0.18em] text-foreground transition-colors duration-150",
].join(" ");

// ============================================================================
// EMPLOYEE ROW
// ============================================================================

function EmployeeRow({
    employee,
    mode,
    draft,
    saving,
    selected,
    onSelect,
    onDraftChange,
    onEdit,
    onSave,
    onCancel,
    onDelete,
}: {
    employee:     Employee;
    mode:         RowMode;
    draft:        RowState;
    saving:       boolean;
    selected:     boolean;
    onSelect:     (checked: boolean) => void;
    onDraftChange:(field: keyof RowState, value: string) => void;
    onEdit:       () => void;
    onSave:       () => void;
    onCancel:     () => void;
    onDelete:     () => void;
}) {
    const isEditing = mode === "edit" || mode === "new";

    const tdCls = "px-3 py-2.5 border-b border-border-light/60 last:border-b-0";

    return (
        <tr className={[
            "transition-colors duration-100 group",
            selected ? "bg-primary-500/[0.04]" : "hover:bg-foreground/[0.02]",
        ].join(" ")}>

            {/* Checkbox */}
            <td className={tdCls + " w-10 text-center"}>
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => onSelect(e.target.checked)}
                    disabled={isEditing}
                    className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer disabled:opacity-30"
                />
            </td>

            {/* Cédula */}
            <td className={tdCls + " w-32"}>
                {mode === "new" ? (
                    <input
                        className={cellInput}
                        placeholder="V-12345678"
                        value={draft.cedula}
                        onChange={(e) => onDraftChange("cedula", e.target.value)}
                    />
                ) : (
                    <span className="font-mono text-[11px] text-foreground/50 uppercase tracking-wider">
                        {employee.cedula}
                    </span>
                )}
            </td>

            {/* Nombre */}
            <td className={tdCls}>
                {isEditing ? (
                    <input
                        className={cellInput}
                        placeholder="Nombre completo"
                        value={draft.nombre}
                        onChange={(e) => onDraftChange("nombre", e.target.value)}
                    />
                ) : (
                    <span className="font-mono text-[12px] font-medium text-foreground">
                        {employee.nombre}
                    </span>
                )}
            </td>

            {/* Cargo */}
            <td className={tdCls + " w-44"}>
                {isEditing ? (
                    <input
                        className={cellInput}
                        placeholder="Cargo"
                        value={draft.cargo}
                        onChange={(e) => onDraftChange("cargo", e.target.value)}
                    />
                ) : (
                    <span className="font-mono text-[11px] text-foreground/60 uppercase tracking-[0.08em]">
                        {employee.cargo}
                    </span>
                )}
            </td>

            {/* Salario */}
            <td className={tdCls + " w-36"}>
                {isEditing ? (
                    <input
                        className={cellInput + " text-right"}
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={draft.salarioMensual}
                        onChange={(e) => onDraftChange("salarioMensual", e.target.value)}
                    />
                ) : (
                    <span className="font-mono text-[12px] tabular-nums text-foreground/80">
                        Bs. {Number(employee.salarioMensual).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                    </span>
                )}
            </td>

            {/* Estado */}
            <td className={tdCls + " w-32"}>
                {isEditing ? (
                    <select
                        value={draft.estado}
                        onChange={(e) => onDraftChange("estado", e.target.value)}
                        className={cellInput}
                    >
                        {ESTADOS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                ) : (
                    <span className={[
                        "inline-flex px-2 py-0.5 rounded-md border font-mono text-[9px] uppercase tracking-[0.14em]",
                        ESTADO_CLS[employee.estado],
                    ].join(" ")}>
                        {employee.estado}
                    </span>
                )}
            </td>

            {/* Actions */}
            <td className={tdCls + " w-24 text-right pr-4"}>
                {saving ? (
                    <div className="flex justify-end"><Spinner /></div>
                ) : isEditing ? (
                    <div className="flex items-center justify-end gap-1">
                        <button
                            onClick={onSave}
                            title="Guardar"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-green-500 hover:bg-green-500/10 transition-colors"
                        >
                            <IconSave />
                        </button>
                        <button
                            onClick={onCancel}
                            title="Cancelar"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:bg-foreground/[0.06] transition-colors"
                        >
                            <IconCancel />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={onEdit}
                            title="Editar"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                        >
                            <IconEdit />
                        </button>
                        <button
                            onClick={onDelete}
                            title="Eliminar"
                            className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:text-red-500 hover:bg-red-500/[0.08] transition-colors"
                        >
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
    const { employees, loading, error, upsert, remove, reload } = useEmployee(companyId);
    const { canAddEmployee, employeesRemaining } = useCapacity();
    const atEmployeeLimit = companyId ? !canAddEmployee(companyId) : false;
    const empRemaining    = companyId ? employeesRemaining(companyId) : null;

    // ── Row state ──────────────────────────────────────────────────────────
    const [modes,    setModes]    = useState<Record<string, RowMode>>({});
    const [drafts,   setDrafts]   = useState<Record<string, RowState>>({});
    const [saving,   setSaving]   = useState<Record<string, boolean>>({});
    const [rowError, setRowError] = useState<Record<string, string>>({});

    // ── New rows ───────────────────────────────────────────────────────────
    const [newRows, setNewRows] = useState<{ id: string; draft: RowState }[]>([]);
    const [newSaving, setNewSaving] = useState<Record<string, boolean>>({});
    const [newRowError, setNewRowError] = useState<Record<string, string>>({});

    // ── Selection ─────────────────────────────────────────────────────────
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // ── Bulk actions state ─────────────────────────────────────────────────
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkError,    setBulkError]    = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    // ── CSV ───────────────────────────────────────────────────────────────
    const [csvLoading, setCsvLoading] = useState(false);
    const [csvError,   setCsvError]   = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Paste modal state ──────────────────────────────────────────────────
    const [pasteOpen,      setPasteOpen]      = useState(false);
    const [pasteText,      setPasteText]      = useState("");
    const [pasteErrors,    setPasteErrors]    = useState<string[]>([]);
    const [pasteCount,     setPasteCount]     = useState<number | null>(null);
    const [pasteImporting, setPasteImporting] = useState(false);

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
        setModes((m)  => ({ ...m, [emp.cedula]: "edit" }));
        setDrafts((d) => ({ ...d, [emp.cedula]: employeeToRow(emp) }));
        setRowError((e) => ({ ...e, [emp.cedula]: "" }));
    }, []);

    const cancelEdit = useCallback((cedula: string) => {
        setModes((m)  => { const n = { ...m }; delete n[cedula]; return n; });
        setDrafts((d) => { const n = { ...d }; delete n[cedula]; return n; });
    }, []);

    const saveRow = useCallback(async (cedula: string) => {
        const draft = drafts[cedula];
        if (!draft) return;

        setSaving((s) => ({ ...s, [cedula]: true }));
        const err = await upsert([{
            cedula:         draft.cedula,
            nombre:         draft.nombre.trim(),
            cargo:          draft.cargo.trim(),
            salarioMensual: parseFloat(draft.salarioMensual) || 0,
            estado:         draft.estado,
        }]);
        setSaving((s) => ({ ...s, [cedula]: false }));

        if (err) {
            setRowError((e) => ({ ...e, [cedula]: err }));
        } else {
            cancelEdit(cedula);
        }
    }, [drafts, upsert, cancelEdit]);

    const deleteOne = useCallback(async (id: string) => {
        const err = await remove([id]);
        if (err) setBulkError(err);
    }, [remove]);

    // ── New row actions ────────────────────────────────────────────────────

    const addNewRow = useCallback(() => {
        const id = `new_${Date.now()}`;
        setNewRows((r) => [{
            id,
            draft: { cedula: "", nombre: "", cargo: "", salarioMensual: "", estado: "activo" },
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
        if (!cedula)           return;
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
            nombre:         draft.nombre.trim(),
            cargo:          draft.cargo.trim(),
            salarioMensual: salary,
            estado:         draft.estado,
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
            else         n.delete(cedula);
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
    const anyEditing  = Object.values(modes).some((m) => m === "edit") || newRows.length > 0;

    return (
        <div className="min-h-full bg-surface-2 p-8 font-mono">
            <div className="max-w-[1100px] mx-auto space-y-5">

                {/* Header */}
                <header className="pb-4 border-b border-border-light">
                    <nav className="text-[10px] uppercase text-foreground/30 mb-1 tracking-widest">
                        Nomina / Empleados
                    </nav>
                    <div className="flex items-end justify-between gap-4">
                        <div>
                            <h1 className="text-xl font-bold uppercase tracking-tighter text-foreground">
                                Gestión de Empleados
                            </h1>
                            {company && (
                                <p className="text-[10px] text-foreground/40 mt-0.5 uppercase tracking-widest">
                                    {company.name} · {empRemaining !== null
                                        ? `${employees.length} / ${employees.length + empRemaining} empleado${employees.length + empRemaining !== 1 ? "s" : ""}`
                                        : `${employees.length} empleado${employees.length !== 1 ? "s" : ""}`
                                    }
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
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
                            <button
                                onClick={addNewRow}
                                disabled={atEmployeeLimit}
                                title={atEmployeeLimit ? "Límite de empleados alcanzado según tu plan" : undefined}
                                className={[
                                    "h-8 px-3 rounded-lg flex items-center gap-1.5 border",
                                    "bg-primary-500 border-primary-600 text-white",
                                    "hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed",
                                    "font-mono text-[10px] uppercase tracking-[0.18em] transition-colors duration-150",
                                ].join(" ")}
                            >
                                <IconPlus />
                                Nuevo empleado
                            </button>
                        </div>
                    </div>
                </header>

                {/* Errors */}
                {(csvError || bulkError) && (
                    <div className="px-3 py-2 border border-red-500/20 rounded-lg bg-red-500/[0.05]">
                        <p className="font-mono text-[10px] text-red-500">{csvError ?? bulkError}</p>
                    </div>
                )}

                {/* Bulk action bar */}
                {selected.size > 0 && (
                    <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-primary-500/20 bg-primary-500/[0.05]">
                        <span className="font-mono text-[11px] text-primary-500">
                            {selected.size} empleado{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelected(new Set())}
                                className="font-mono text-[10px] uppercase tracking-widest text-foreground/40 hover:text-foreground transition-colors"
                            >
                                Deseleccionar
                            </button>
                            {confirmDelete ? (
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-[10px] text-red-500">¿Confirmar eliminación?</span>
                                    <button
                                        onClick={handleBulkDelete}
                                        disabled={bulkDeleting}
                                        className="h-7 px-3 rounded-lg bg-red-500 text-white font-mono text-[10px] uppercase tracking-widest hover:bg-red-600 disabled:opacity-50 transition-colors"
                                    >
                                        {bulkDeleting ? "Eliminando…" : "Sí, eliminar"}
                                    </button>
                                    <button
                                        onClick={() => setConfirmDelete(false)}
                                        className="h-7 px-3 rounded-lg border border-border-light font-mono text-[10px] uppercase tracking-widest text-foreground/50 hover:text-foreground transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setConfirmDelete(true)}
                                    className="h-7 px-3 rounded-lg border border-red-500/30 bg-red-500/[0.08] text-red-500 font-mono text-[10px] uppercase tracking-widest hover:bg-red-500/[0.14] transition-colors flex items-center gap-1.5"
                                >
                                    <IconTrash />
                                    Eliminar selección
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="5.5" cy="5.5" r="4" /><path d="M10.5 10.5l-2.5-2.5" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Buscar por nombre, cédula o cargo…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className={[
                            "w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none",
                            "font-mono text-[12px] text-foreground placeholder:text-foreground/25",
                            "focus:border-primary-500/50 hover:border-border-medium transition-colors duration-150",
                        ].join(" ")}
                    />
                </div>

                {/* Table */}
                {loading ? (
                    <div className="flex items-center justify-center h-32 border border-border-light rounded-xl">
                        <div className="flex items-center gap-2 text-foreground/30">
                            <Spinner />
                            <span className="font-mono text-[11px] uppercase tracking-widest">Cargando empleados…</span>
                        </div>
                    </div>
                ) : error ? (
                    <div className="px-4 py-3 border border-red-500/20 rounded-xl bg-red-500/[0.05]">
                        <p className="font-mono text-[11px] text-red-500">{error}</p>
                    </div>
                ) : (
                    <div className="border border-border-light rounded-xl overflow-hidden bg-surface-1">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-border-light bg-surface-2">
                                    <th className="px-3 py-2.5 w-10 text-center">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={(e) => toggleAll(e.target.checked)}
                                            disabled={anyEditing || filtered.length === 0}
                                            className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer disabled:opacity-30"
                                        />
                                    </th>
                                    {["Cédula", "Nombre", "Cargo", "Salario Bs.", "Estado", ""].map((h) => (
                                        <th key={h} className="px-3 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/35 whitespace-nowrap">
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
                                        <td className="px-3 py-2.5 w-32">
                                            <input className={cellInput} placeholder="V-12345678"
                                                value={row.draft.cedula}
                                                onChange={(e) => updateNewDraft(row.id, "cedula", e.target.value)} />
                                        </td>
                                        <td className="px-3 py-2.5">
                                            <input className={cellInput} placeholder="Nombre completo"
                                                value={row.draft.nombre}
                                                onChange={(e) => updateNewDraft(row.id, "nombre", e.target.value)} />
                                        </td>
                                        <td className="px-3 py-2.5 w-44">
                                            <input className={cellInput} placeholder="Cargo"
                                                value={row.draft.cargo}
                                                onChange={(e) => updateNewDraft(row.id, "cargo", e.target.value)} />
                                        </td>
                                        <td className="px-3 py-2.5 w-36">
                                            <input className={cellInput + " text-right"} type="number" step="0.01" min="0" placeholder="0.00"
                                                value={row.draft.salarioMensual}
                                                onChange={(e) => updateNewDraft(row.id, "salarioMensual", e.target.value)} />
                                        </td>
                                        <td className="px-3 py-2.5 w-32">
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
                                                        className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:bg-foreground/[0.06] transition-colors">
                                                        <IconCancel />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                    {newRowError[row.id] && (
                                        <tr className="bg-red-500/[0.04]">
                                            <td colSpan={7} className="px-4 py-1.5">
                                                <p className="font-mono text-[10px] text-red-400">{newRowError[row.id]}</p>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                ))}

                                {/* Existing rows */}
                                {filtered.length === 0 && newRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="px-4 py-12 text-center font-mono text-[11px] text-foreground/25 uppercase tracking-widest">
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
                                            onDelete={() => deleteOne(emp.cedula)}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

            </div>

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
                                <p className="font-mono text-[9px] text-foreground/35 mt-0.5 uppercase tracking-widest">
                                    Empleados · columnas: cedula, nombre, cargo, salario_mensual_ves, estado
                                </p>
                            </div>
                            <button onClick={closePasteModal}
                                className="w-7 h-7 flex items-center justify-center rounded-md text-foreground/40 hover:text-foreground hover:bg-foreground/[0.06] transition-colors">
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
                                    "font-mono text-[11px] text-foreground leading-relaxed",
                                    "border-border-light focus:border-primary-500/60 hover:border-border-medium",
                                    "transition-colors duration-150 placeholder:text-foreground/20",
                                ].join(" ")}
                            />

                            {/* Validation feedback */}
                            {pasteText.trim() && pasteErrors.length === 0 && pasteCount !== null && (
                                <p className="font-mono text-[10px] text-green-500">
                                    {pasteCount} empleado{pasteCount !== 1 ? "s" : ""} listo{pasteCount !== 1 ? "s" : ""} para importar.
                                </p>
                            )}
                            {pasteErrors.length > 0 && (
                                <div className="space-y-1">
                                    {pasteErrors.slice(0, 3).map((e, i) => (
                                        <p key={i} className="font-mono text-[10px] text-red-500">{e}</p>
                                    ))}
                                    {pasteErrors.length > 3 && (
                                        <p className="font-mono text-[10px] text-foreground/30">…y {pasteErrors.length - 3} error(es) más.</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal footer */}
                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-light">
                            <button onClick={closePasteModal}
                                className="h-8 px-4 rounded-lg border border-border-light font-mono text-[10px] uppercase tracking-widest text-foreground/50 hover:text-foreground hover:border-border-medium transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handlePasteImport}
                                disabled={pasteImporting || pasteErrors.length > 0 || !pasteText.trim() || pasteCount === 0}
                                className={[
                                    "h-8 px-4 rounded-lg font-mono text-[10px] uppercase tracking-widest",
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
