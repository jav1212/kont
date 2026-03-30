"use client";

import React, { useState, useCallback, useRef } from "react";
import { APP_SIZES } from "@/src/shared/frontend/sizes";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useEmployee } from "@/src/modules/payroll/frontend/hooks/use-employee";
import type { Employee, EmployeeEstado, EmployeeMoneda, SalaryHistoryEntry } from "@/src/modules/payroll/frontend/hooks/use-employee";
import { employeesToCsv, downloadCsv, parseCsv } from "@/src/modules/payroll/frontend/utils/employee-csv";
import { useCapacity } from "@/src/modules/billing/frontend/hooks/use-capacity";
import {
    Users,
    Download,
    Upload,
    Plus,
    Search,
    Trash2,
    Edit3,
    Check,
    X,
    Clock,
    Loader2,
    AlertCircle,
    Copy,
    ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
    activo: "border-green-500/20 bg-green-500/10 text-green-600",
    inactivo: "border-red-500/20 bg-red-500/10 text-red-600",
    vacacion: "border-orange-500/20 bg-orange-500/10 text-orange-600",
};

// ============================================================================
// SMALL COMPONENTS
// ============================================================================

const cellInput = [
    "w-full h-8 px-2 rounded-lg border bg-surface-1 outline-none",
    "font-mono text-[12px] text-foreground tabular-nums appearance-none",
    "border-border-light focus:border-primary-500/60 focus:bg-surface-1",
    "hover:border-border-medium transition-colors duration-150",
].join(" ");

const Spinner = () => <Loader2 className="animate-spin text-[var(--text-tertiary)]" size={13} />;
const IconEdit = () => <Edit3 size={14} />;
const IconSave = () => <Check size={14} />;
const IconCancel = () => <X size={14} />;
const IconTrash = () => <Trash2 size={14} />;
const IconPlus = () => <Plus size={14} />;
const IconHistory = () => <Clock size={14} />;
const IconExport = () => <Download size={14} />;
const IconImport = () => <Upload size={14} />;
const IconPaste = () => <Copy size={14} />;

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
    const tdCls = "px-5 py-4 border-b border-border-light/40 last:border-b-0";

    return (
        <tr className={[
            "transition-colors duration-100 group",
            selected ? "bg-primary-500/[0.04]" : "hover:bg-surface-2/40"
        ].join(" ")}>

            {/* Checkbox */}
            <td className={tdCls + " w-12 text-center"}>
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => onSelect(e.target.checked)}
                    disabled={isEditing}
                    className="w-4 h-4 rounded border-border-medium text-primary-500 focus:ring-primary-500/20 cursor-pointer disabled:opacity-30 transition-all"
                />
            </td>

            {/* Cédula */}
            <td className={tdCls + " w-32"}>
                {mode === "new" ? (
                    <input
                        className={cellInput}
                        placeholder="V-12345678"
                        autoFocus
                        value={draft.cedula}
                        onChange={(e) => onDraftChange("cedula", e.target.value)}
                    />
                ) : (
                    <span className="font-mono text-[12px] text-[var(--text-secondary)] tracking-tight">
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
                    <span className="text-[14px] font-medium text-foreground tracking-tight">
                        {employee.nombre}
                    </span>
                )}
            </td>

            {/* Cargo */}
            <td className={tdCls + " w-40"}>
                {isEditing ? (
                    <input
                        className={cellInput}
                        placeholder="Cargo"
                        value={draft.cargo}
                        onChange={(e) => onDraftChange("cargo", e.target.value)}
                    />
                ) : (
                    <span className="text-[13px] text-[var(--text-secondary)]">
                        {employee.cargo}
                    </span>
                )}
            </td>

            {/* Salario + Moneda */}
            <td className={tdCls + " w-52"}>
                {isEditing ? (
                    <div className="flex h-8 rounded-lg border border-border-light bg-surface-1 focus-within:border-primary-500/60 hover:border-border-medium overflow-hidden transition-all duration-200 shadow-sm">
                        <div className="relative">
                            <select
                                className="bg-surface-2 border-r border-border-light pl-2 pr-6 h-full font-mono text-[11px] text-[var(--text-secondary)] outline-none cursor-pointer hover:bg-surface-1 transition-colors appearance-none"
                                value={draft.moneda}
                                onChange={(e) => onDraftChange("moneda", e.target.value)}>
                                <option value="VES">VES</option>
                                <option value="USD">USD</option>
                            </select>
                            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                        </div>
                        <input
                            className="flex-1 min-w-0 bg-transparent px-2.5 font-mono text-[13px] text-right tabular-nums text-foreground outline-none"
                            type="number" step="0.01" min="0" placeholder="0.00"
                            value={draft.salarioMensual} onChange={(e) => onDraftChange("salarioMensual", e.target.value)} />
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-[14px] tabular-nums text-foreground font-medium">
                            {Number(employee.salarioMensual).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                        </span>
                        <span className={[
                            "font-mono text-[10px] px-1.5 py-0.5 rounded border uppercase tracking-widest font-bold",
                            employee.moneda === "USD"
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                : "border-border-light bg-surface-2 text-[var(--text-tertiary)]",
                        ].join(" ")}>
                            {employee.moneda ?? "VES"}
                        </span>
                    </div>
                )}
            </td>

            {/* Fecha de ingreso */}
            <td className={tdCls + " w-36"}>
                {isEditing ? (
                    <input
                        className={cellInput}
                        type="date"
                        value={draft.fechaIngreso}
                        onChange={(e) => onDraftChange("fechaIngreso", e.target.value)}
                    />
                ) : (
                    <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] text-[var(--text-secondary)] whitespace-nowrap">
                            {employee.fechaIngreso
                                ? new Date(employee.fechaIngreso + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })
                                : <span className="text-[var(--text-disabled)]">—</span>}
                        </span>
                        {employee.fechaIngreso && (
                            <span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium opacity-70">
                                {calcAntiguedad(employee.fechaIngreso)}
                            </span>
                        )}
                    </div>
                )}
            </td>

            {/* Estado */}
            <td className={tdCls + " w-32"}>
                {isEditing ? (
                    <div className="relative">
                        <select
                            value={draft.estado}
                            onChange={(e) => onDraftChange("estado", e.target.value)}
                            className={cellInput}>
                            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                    </div>
                ) : (
                    <span className={[
                        "inline-flex px-2 py-0.5 rounded-lg border font-mono text-[10px] uppercase tracking-wider font-bold",
                        ESTADO_CLS[employee.estado]
                    ].join(" ")}>
                        {employee.estado}
                    </span>
                )}
            </td>

            {/* Actions */}
            <td className={tdCls + " w-32 text-right"}>
                {saving ? (
                    <div className="flex justify-end pr-2"><Spinner /></div>
                ) : isEditing ? (
                    <div className="flex items-center justify-end gap-1">
                        <BaseButton.Icon
                            variant="ghost"
                            size="sm"
                            onClick={onSave}
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            title="Guardar">
                            <IconSave />
                        </BaseButton.Icon>
                        <BaseButton.Icon
                            variant="ghost"
                            size="sm"
                            onClick={onCancel}
                            className="text-[var(--text-tertiary)]"
                            title="Cancelar">
                            <IconCancel />
                        </BaseButton.Icon>
                    </div>
                ) : (
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity pr-1">
                        <BaseButton.Icon
                            variant="ghost"
                            size="sm"
                            onClick={onShowHistory}
                            className="text-[var(--text-tertiary)] hover:text-primary-500 hover:bg-primary-500/5"
                            title="Historial de salario">
                            <IconHistory />
                        </BaseButton.Icon>
                        <BaseButton.Icon
                            variant="ghost"
                            size="sm"
                            onClick={onEdit}
                            className="text-[var(--text-tertiary)] hover:text-foreground"
                            title="Editar">
                            <IconEdit />
                        </BaseButton.Icon>
                        <BaseButton.Icon
                            variant="ghost"
                            size="sm"
                            onClick={onDelete}
                            className="text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-50"
                            title="Eliminar">
                            <IconTrash />
                        </BaseButton.Icon>
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
        <div className="min-h-full bg-surface-2 selection:bg-primary-500/30">
            <PageHeader
                title="Empleados"
                subtitle={company ? (
                    empRemaining !== null
                        ? `${employees.length} / ${employees.length + empRemaining} empleado${employees.length + empRemaining !== 1 ? "s" : ""}`
                        : `${employees.length} empleado${employees.length !== 1 ? "s" : ""}`
                ) : undefined}
            >
                <div className="flex items-center gap-2 flex-wrap">
                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={handleExport}
                        isDisabled={employees.length === 0}
                        leftIcon={<IconExport />}
                    >
                        Exportar
                    </BaseButton.Root>

                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        isDisabled={csvLoading || atEmployeeLimit}
                        title={atEmployeeLimit ? "Límite de empleados alcanzado" : undefined}
                        leftIcon={csvLoading ? <Spinner /> : <IconImport />}
                    >
                        Importar
                    </BaseButton.Root>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        className="sr-only"
                        onChange={handleImport}
                        disabled={atEmployeeLimit}
                    />

                    <BaseButton.Root
                        variant="secondary"
                        size="sm"
                        onClick={() => setPasteOpen(true)}
                        isDisabled={atEmployeeLimit}
                        title={atEmployeeLimit ? "Límite de empleados alcanzado" : undefined}
                        leftIcon={<IconPaste />}
                    >
                        Pegar
                    </BaseButton.Root>

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
            </PageHeader>

            <div className="px-8 py-6 space-y-6">

                {/* Errors */}
                {(csvError || bulkError || error) && (
                    <div className="px-3 py-2 border border-red-500/20 rounded-lg bg-red-500/[0.05]">
                        <p className="font-mono text-[10px] text-red-500 uppercase tracking-wider">
                            {csvError ?? bulkError ?? error}
                        </p>
                    </div>
                )}

                {/* Bulk action bar */}
                <AnimatePresence>
                    {selected.size > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex items-center justify-between px-6 py-4 rounded-2xl border border-primary-500/20 bg-primary-500/[0.03] shadow-sm"
                        >
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/10 text-primary-600">
                                    <Users size={16} />
                                </div>
                                <span className="text-[14px] font-medium text-primary-600">
                                    {selected.size} empleado{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <BaseButton.Root
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelected(new Set())}
                                    className="text-[var(--text-tertiary)] hover:text-foreground"
                                >
                                    Deseleccionar
                                </BaseButton.Root>
                                {confirmDelete ? (
                                    <div className="flex items-center gap-2 bg-red-50 p-1 rounded-xl border border-red-100">
                                        <BaseButton.Root
                                            variant="danger"
                                            size="sm"
                                            onClick={handleBulkDelete}
                                            loading={bulkDeleting}
                                            className="h-8 px-4 text-[11px]"
                                        >
                                            Confirmar eliminación
                                        </BaseButton.Root>
                                        <BaseButton.Root
                                            variant="secondary"
                                            size="sm"
                                            onClick={() => setConfirmDelete(false)}
                                            className="h-8 px-4 text-[11px]"
                                        >
                                            No
                                        </BaseButton.Root>
                                    </div>
                                ) : (
                                    <BaseButton.Root
                                        variant="danger"
                                        size="sm"
                                        onClick={() => setConfirmDelete(true)}
                                        leftIcon={<IconTrash />}
                                    >
                                        Eliminar selección
                                    </BaseButton.Root>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Main Content Area */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-64 gap-4 border border-border-light rounded-2xl bg-surface-1/50">
                        <Loader2 className="animate-spin text-primary-500" size={32} strokeWidth={1.5} />
                        <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Cargando nómina…</span>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Search bar section */}
                        <div className="relative group max-w-md">
                            <Search
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-primary-500 transition-colors"
                                size={15}
                            />
                            <input
                                type="text"
                                placeholder="Buscar por nombre, cédula o cargo…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className={[
                                    "w-full h-10 pl-10 pr-4 rounded-xl border border-border-light bg-surface-1 outline-none",
                                    "text-[14px] text-foreground placeholder:text-[var(--text-disabled)]",
                                    "focus:border-primary-500/50 focus:ring-4 focus:ring-primary-500/5 hover:border-border-medium transition-all duration-200",
                                ].join(" ")}
                            />
                        </div>

                        {/* Table Container */}
                        <div className="border border-border-light rounded-2xl overflow-hidden bg-surface-1 shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-surface-2/50 border-b border-border-light">
                                            <th className="px-5 py-3.5 w-12 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={(e) => toggleAll(e.target.checked)}
                                                    disabled={anyEditing || filtered.length === 0}
                                                    className="w-4 h-4 rounded border-border-medium text-primary-500 focus:ring-primary-500/20 cursor-pointer disabled:opacity-30 transition-all"
                                                />
                                            </th>
                                            {["Cédula", "Nombre", "Cargo", "Salario / Moneda", "Ingreso / Antigüedad", "Estado", ""].map((h) => (
                                                <th key={h} className="px-5 py-3.5 font-medium text-[var(--text-tertiary)] uppercase tracking-wider text-[11px] whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border-light/40">
                                        {/* New rows render with distinct style */}
                                        <AnimatePresence initial={false}>
                                            {newRows.map((row) => (
                                                <motion.tr
                                                    key={row.id}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="bg-primary-500/[0.02]"
                                                >
                                                    <td className="px-5 py-4 w-12 text-center">
                                                        <div className="w-4 h-4 rounded border-2 border-dashed border-primary-500/20 mx-auto" />
                                                    </td>
                                                    <td className="px-5 py-4 w-32">
                                                        <input
                                                            className={cellInput}
                                                            placeholder="V-12345678"
                                                            autoFocus
                                                            value={row.draft.cedula}
                                                            onChange={(e) => updateNewDraft(row.id, "cedula", e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <input
                                                            className={cellInput}
                                                            placeholder="Nombre completo"
                                                            value={row.draft.nombre}
                                                            onChange={(e) => updateNewDraft(row.id, "nombre", e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-5 py-4 w-40">
                                                        <input
                                                            className={cellInput}
                                                            placeholder="Cargo"
                                                            value={row.draft.cargo}
                                                            onChange={(e) => updateNewDraft(row.id, "cargo", e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-5 py-4 w-52">
                                                        <div className="flex h-8 rounded-lg border border-border-light bg-surface-1 focus-within:border-primary-500/60 hover:border-border-medium overflow-hidden transition-all duration-200">
                                                            <select
                                                                className="bg-surface-2 border-r border-border-light px-2 font-mono text-[11px] text-[var(--text-secondary)] outline-none cursor-pointer hover:bg-surface-1 transition-colors"
                                                                value={row.draft.moneda}
                                                                onChange={(e) => updateNewDraft(row.id, "moneda", e.target.value)}>
                                                                <option value="VES">VES</option>
                                                                <option value="USD">USD</option>
                                                            </select>
                                                            <input
                                                                className="flex-1 min-w-0 bg-transparent px-2.5 font-mono text-[13px] text-right tabular-nums text-foreground outline-none"
                                                                type="number" step="0.01" min="0" placeholder="0.00"
                                                                value={row.draft.salarioMensual}
                                                                onChange={(e) => updateNewDraft(row.id, "salarioMensual", e.target.value)} />
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 w-36">
                                                        <input
                                                            className={cellInput}
                                                            type="date"
                                                            value={row.draft.fechaIngreso}
                                                            onChange={(e) => updateNewDraft(row.id, "fechaIngreso", e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-5 py-4 w-32">
                                                        <select
                                                            className={cellInput}
                                                            value={row.draft.estado}
                                                            onChange={(e) => updateNewDraft(row.id, "estado", e.target.value)}
                                                        >
                                                            {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="px-5 py-4 w-32 text-right">
                                                        {newSaving[row.id] ? (
                                                            <div className="flex justify-end pr-2"><Spinner /></div>
                                                        ) : (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <BaseButton.Icon
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => saveNewRow(row.id)}
                                                                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                                                >
                                                                    <IconSave />
                                                                </BaseButton.Icon>
                                                                <BaseButton.Icon
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => cancelNewRow(row.id)}
                                                                >
                                                                    <IconCancel />
                                                                </BaseButton.Icon>
                                                            </div>
                                                        )}
                                                        {newRowError[row.id] && (
                                                            <div className="absolute left-0 right-0 py-1 bg-red-50 border-y border-red-100 px-5 mt-1 z-10">
                                                                <p className="font-mono text-[10px] text-red-500 flex items-center gap-1">
                                                                    <AlertCircle size={10} /> {newRowError[row.id]}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </td>
                                                </motion.tr>
                                            ))}
                                        </AnimatePresence>

                                        {/* Existing rows */}
                                        {filtered.length === 0 && newRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} className="px-5 py-24 text-center">
                                                    <motion.div
                                                        initial={{ opacity: 0, scale: 0.9 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        className="flex flex-col items-center justify-center space-y-4 opacity-40"
                                                    >
                                                        <div className="p-5 rounded-3xl bg-surface-2 border border-border-light">
                                                            <Users size={48} strokeWidth={1} className="text-[var(--text-tertiary)]" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <h3 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                                                {employees.length === 0 ? "Sin empleados registrados" : "Búsqueda sin resultados"}
                                                            </h3>
                                                            <p className="text-[12px] text-[var(--text-secondary)] max-w-xs mx-auto">
                                                                {employees.length === 0
                                                                    ? "Crea o importa empleados para comenzar a gestionar tu nómina."
                                                                    : "No encontramos empleados que coincidan con tu búsqueda."}
                                                            </p>
                                                        </div>
                                                    </motion.div>
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

            {/* ── Modals Area ────────────────────────────────────────────────── */}

            {/* Salary History Modal */}
            <AnimatePresence>
                {historyModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setHistoryModal(null)}
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative w-full max-w-md bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-2/30">
                                <div>
                                    <h2 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                        Historial Salarial
                                    </h2>
                                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-wider">
                                        {historyModal.nombre} · {historyModal.cedula}
                                    </p>
                                </div>
                                <BaseButton.Icon variant="ghost" size="sm" onClick={() => setHistoryModal(null)}>
                                    <IconCancel />
                                </BaseButton.Icon>
                            </div>

                            <div className="p-6">
                                {historyLoading ? (
                                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                                        <Spinner />
                                        <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Consultando…</span>
                                    </div>
                                ) : historyError ? (
                                    <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-center gap-3 text-red-600">
                                        <AlertCircle size={18} />
                                        <p className="text-[13px] font-medium">{historyError}</p>
                                    </div>
                                ) : historyData.length === 0 ? (
                                    <div className="text-center py-12 opacity-40">
                                        <Clock size={40} strokeWidth={1} className="mx-auto mb-3" />
                                        <p className="text-[12px] uppercase tracking-widest font-medium">Sin variaciones registradas</p>
                                    </div>
                                ) : (
                                    <div className="border border-border-light rounded-xl overflow-hidden shadow-sm">
                                        <table className="w-full text-left text-[13px]">
                                            <thead>
                                                <tr className="bg-surface-2/50 border-b border-border-light">
                                                    {["Desde", "Salario", "Moneda"].map((h) => (
                                                        <th key={h} className="px-4 py-2.5 font-bold text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border-light/40">
                                                {historyData.map((entry) => (
                                                    <tr key={entry.id} className="hover:bg-surface-2/50 transition-colors">
                                                        <td className="px-4 py-3 text-[var(--text-secondary)] font-mono">
                                                            {new Date(entry.fechaDesde + "T00:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}
                                                        </td>
                                                        <td className="px-4 py-3 font-semibold tabular-nums text-foreground">
                                                            {entry.salarioMensual.toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={[
                                                                "text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded font-bold",
                                                                entry.moneda === "USD" ? "bg-emerald-500/10 text-emerald-600" : "bg-surface-2 text-[var(--text-tertiary)]",
                                                            ].join(" ")}>
                                                                {entry.moneda}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end px-6 py-4 border-t border-border-light bg-surface-2/30">
                                <BaseButton.Root variant="secondary" size="sm" onClick={() => setHistoryModal(null)}>
                                    Cerrar
                                </BaseButton.Root>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Paste CSV Modal */}
            <AnimatePresence>
                {pasteOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closePasteModal}
                            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="relative w-full max-w-lg bg-surface-1 border border-border-light rounded-2xl shadow-2xl overflow-hidden flex flex-col"
                        >
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border-light bg-surface-2/30">
                                <div>
                                    <h2 className="text-[14px] font-bold uppercase tracking-widest text-foreground">
                                        Importar Datos
                                    </h2>
                                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 uppercase tracking-wider">
                                        CSV · cedula, nombre, cargo, salario, estado
                                    </p>
                                </div>
                                <BaseButton.Icon variant="ghost" size="sm" onClick={closePasteModal}>
                                    <IconCancel />
                                </BaseButton.Icon>
                            </div>

                            <div className="p-6 space-y-4">
                                <textarea
                                    autoFocus
                                    rows={8}
                                    value={pasteText}
                                    onChange={(e) => handlePasteChange(e.target.value)}
                                    placeholder={`"cedula","nombre","cargo","salario","estado"\n"V-12345678","JUAN PEREZ","ANALISTA","1250.50","activo"`}
                                    className={[
                                        "w-full resize-none rounded-xl border bg-surface-2/50 outline-none p-4",
                                        "font-mono text-[12px] text-foreground leading-relaxed",
                                        "border-border-light focus:border-primary-500/50 focus:ring-4 focus:ring-primary-500/5",
                                        "transition-all duration-200 placeholder:text-[var(--text-disabled)]",
                                    ].join(" ")}
                                />

                                {pasteText.trim() && pasteErrors.length === 0 && pasteCount !== null && (
                                    <div className="flex items-center gap-2 text-green-600">
                                        <Check size={14} />
                                        <p className="text-[11px] font-medium">
                                            {pasteCount} empleado{pasteCount !== 1 ? "s" : ""} listo{pasteCount !== 1 ? "s" : ""} para importar.
                                        </p>
                                    </div>
                                )}
                                {pasteErrors.length > 0 && (
                                    <div className="p-3 rounded-lg bg-red-50 border border-red-100 space-y-1">
                                        {pasteErrors.slice(0, 2).map((e, i) => (
                                            <p key={i} className="text-[10px] text-red-600 flex items-center gap-1.5"><X size={10} /> {e}</p>
                                        ))}
                                        {pasteErrors.length > 2 && (
                                            <p className="text-[10px] text-[var(--text-tertiary)] pl-4">…y {pasteErrors.length - 2} errores más.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-light bg-surface-2/30">
                                <BaseButton.Root variant="secondary" size="sm" onClick={closePasteModal}>
                                    Cancelar
                                </BaseButton.Root>
                                <BaseButton.Root
                                    variant="primary"
                                    size="sm"
                                    onClick={handlePasteImport}
                                    disabled={pasteImporting || pasteErrors.length > 0 || !pasteText.trim() || pasteCount === 0}
                                    loading={pasteImporting}
                                    leftIcon={<IconPaste />}
                                >
                                    Importar ahora
                                </BaseButton.Root>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
