"use client";

// Departments catalog page — CRUD, CSV import/export, bulk delete.
// Uses English domain types (Department) and English useInventory() API.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { notify } from "@/src/shared/frontend/notify";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import type { Department } from "@/src/modules/inventory/backend/domain/department";
import {
    departmentsToCsv,
    parseDepartmentsCsv,
    downloadCsv,
    type DepartmentCsvResult,
} from "@/src/modules/inventory/frontend/utils/inventory-csv";
import {
    Layers,
    Plus,
    Search,
    Download,
    Upload,
    ClipboardPaste,
    Pencil,
    Trash2,
    X,
    Tag,
    AlignLeft,
    CheckCircle2,
    Package,
    FolderOpen,
    Folders,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-default bg-surface-1 outline-none",
    "font-mono text-[15px] text-foreground tabular-nums",
    "focus:border-primary-500 hover:border-border-medium transition-colors duration-150",
].join(" ");

type EstadoFilter = "todos" | "activo" | "inactivo";

function emptyDepartment(companyId: string): Department {
    return { companyId, name: "", description: "", active: true };
}

// ── small UI primitives (page-local) ─────────────────────────────────────────

function StatTile({
    label,
    value,
    sublabel,
    icon: Icon,
    tone = "default",
}: {
    label: string;
    value: string | number;
    sublabel?: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    tone?: "default" | "primary" | "success" | "warning" | "muted";
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
    active,
    onClick,
    children,
    count,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
    count?: number;
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

function FormSection({
    icon: Icon,
    title,
    description,
    children,
}: {
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    title: string;
    description?: string;
    children: React.ReactNode;
}) {
    return (
        <section className="border-t border-border-light first:border-t-0 pt-5 first:pt-0 pb-5 last:pb-0">
            <div className="flex items-start gap-3 mb-4">
                <div className="h-8 w-8 rounded-lg border border-border-light bg-surface-2 flex items-center justify-center text-[var(--text-secondary)] flex-shrink-0">
                    <Icon size={14} strokeWidth={2} />
                </div>
                <div>
                    <h3 className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-foreground">
                        {title}
                    </h3>
                    {description && (
                        <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-0.5">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {children}
        </section>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function DepartamentosPage() {
    const { companyId } = useCompany();
    const {
        departments, loadingDepartments,
        loadDepartments, saveDepartment, deleteDepartment,
        products, loadProducts,
    } = useInventory();

    const [form, setForm] = useState<Department | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<DepartmentCsvResult | null>(null);
    const [importing, setImporting] = useState(false);
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState("");
    const [estadoFilter, setEstadoFilter] = useState<EstadoFilter>("todos");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (companyId) {
            loadDepartments(companyId);
            loadProducts(companyId);
        }
    }, [companyId, loadDepartments, loadProducts]);

    function openNew() {
        if (!companyId) return;
        setForm(emptyDepartment(companyId));
    }

    function openEdit(d: Department) {
        setForm({ ...d });
    }

    function closeForm() { setForm(null); }

    async function handleSave() {
        if (!form) return;
        if (!form.name.trim()) { notify.error("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveDepartment(form);
        setSaving(false);
        if (saved) closeForm();
    }

    async function handleDelete(id: string) {
        setDeletingId(id);
        await deleteDepartment(id);
        setDeletingId(null);
        setConfirmDelete(null);
    }

    async function handleBulkDelete() {
        setBulkDeleting(true);
        for (const id of selected) {
            await deleteDepartment(id);
        }
        setBulkDeleting(false);
        setSelected(new Set());
        setConfirmBulkDelete(false);
    }

    const set = (k: keyof Department, v: string | boolean) =>
        setForm((f) => f ? { ...f, [k]: v } : f);

    function handleExport() {
        downloadCsv(departmentsToCsv(departments), "departamentos.csv");
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = parseDepartmentsCsv(ev.target?.result as string);
            setImportResult(result);
        };
        reader.readAsText(file, "utf-8");
        e.target.value = "";
    }

    function handlePasteParse() {
        if (!pasteText.trim()) return;
        const result = parseDepartmentsCsv(pasteText);
        setImportResult(result);
        setPasteOpen(false);
        setPasteText("");
    }

    async function handleImport() {
        if (!importResult || !companyId) return;
        setImporting(true);
        for (const d of importResult.departments) {
            await saveDepartment({ ...d, companyId });
        }
        setImporting(false);
        setImportResult(null);
        loadDepartments(companyId);
    }

    // ── derived ─────────────────────────────────────────────────────────────
    // Map from departmentId → product count, for the table column.
    const productCountByDept = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of products) {
            if (!p.departmentId) continue;
            map.set(p.departmentId, (map.get(p.departmentId) ?? 0) + 1);
        }
        return map;
    }, [products]);

    const stats = useMemo(() => {
        const active   = departments.filter((d) => d.active).length;
        const inactive = departments.length - active;
        const used     = departments.filter((d) => d.id && (productCountByDept.get(d.id) ?? 0) > 0).length;
        const orphans  = products.filter((p) => !p.departmentId).length;
        return {
            total:    departments.length,
            active,
            inactive,
            used,
            orphans,
        };
    }, [departments, products, productCountByDept]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return departments.filter((d) => {
            if (estadoFilter === "activo"   && !d.active) return false;
            if (estadoFilter === "inactivo" &&  d.active) return false;
            if (!q) return true;
            return [d.name, d.description ?? ""].join(" ").toLowerCase().includes(q);
        });
    }, [departments, search, estadoFilter]);

    const hasFilters = search.trim() !== "" || estadoFilter !== "todos";
    function clearFilters() {
        setSearch("");
        setEstadoFilter("todos");
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Departamentos" subtitle="Categorías para clasificar productos">
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={handleExport}
                    isDisabled={departments.length === 0}
                    leftIcon={<Download size={14} />}
                >
                    Exportar
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={() => { setPasteOpen((v) => !v); }}
                    leftIcon={<ClipboardPaste size={14} />}
                >
                    Pegar CSV
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={() => fileRef.current?.click()}
                    leftIcon={<Upload size={14} />}
                >
                    Importar CSV
                </BaseButton.Root>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                <BaseButton.Root variant="primary" size="sm" onClick={openNew} leftIcon={<Plus size={14} strokeWidth={2.5} />}>
                    Nuevo departamento
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-5">

                {/* KPI strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatTile label="Total"               value={stats.total}    icon={Layers}     tone="primary"  />
                    <StatTile label="Activos"             value={stats.active}   icon={FolderOpen} tone="success"  sublabel={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% del catálogo` : "Sin departamentos"} />
                    <StatTile label="En uso"              value={stats.used}     icon={Folders}    tone="default"  sublabel={stats.total ? `${stats.total - stats.used} sin productos` : undefined} />
                    <StatTile label="Productos sin asignar" value={stats.orphans}  icon={Package}    tone={stats.orphans > 0 ? "warning" : "muted"} sublabel="Sin departamento" />
                </div>

                {/* Toolbar */}
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm">
                    <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                        <div className="relative w-full sm:w-72">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o descripción…"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-default bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500 hover:border-border-medium transition-colors"
                            />
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mr-1 hidden md:inline">Estado</span>
                            <FilterChip active={estadoFilter === "todos"}    onClick={() => setEstadoFilter("todos")}    count={stats.total}>Todos</FilterChip>
                            <FilterChip active={estadoFilter === "activo"}   onClick={() => setEstadoFilter("activo")}   count={stats.active}>Activos</FilterChip>
                            <FilterChip active={estadoFilter === "inactivo"} onClick={() => setEstadoFilter("inactivo")} count={stats.inactive}>Inactivos</FilterChip>
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
                                <span className="text-foreground font-semibold">{filtered.length}</span> / {departments.length}
                            </span>
                        </div>
                    </div>

                    {selected.size > 0 && (
                        <div className="border-t border-border-light px-4 py-2.5 flex items-center gap-3 bg-surface-2/40">
                            <span className="font-mono text-[12px] text-foreground">
                                <span className="font-semibold tabular-nums">{selected.size}</span> seleccionado(s)
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
                                        <span className="font-sans text-[12px] text-[var(--text-secondary)]">¿Eliminar {selected.size} elemento(s)?</span>
                                        <BaseButton.Root variant="danger" size="sm" onClick={handleBulkDelete} isDisabled={bulkDeleting} loading={bulkDeleting}>
                                            {bulkDeleting ? "Eliminando…" : "Confirmar"}
                                        </BaseButton.Root>
                                        <BaseButton.Root variant="secondary" size="sm" onClick={() => setConfirmBulkDelete(false)} isDisabled={bulkDeleting}>
                                            Cancelar
                                        </BaseButton.Root>
                                    </div>
                                ) : (
                                    <BaseButton.Root variant="dangerOutline" size="sm" onClick={() => setConfirmBulkDelete(true)} leftIcon={<Trash2 size={13} />}>
                                        Eliminar {selected.size}
                                    </BaseButton.Root>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Error */}

                {/* Paste CSV panel */}
                {pasteOpen && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    Pegar CSV
                                </p>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-0.5">
                                    La primera fila debe ser el encabezado. Los nombres se guardan en MAYÚSCULAS.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { setPasteOpen(false); setPasteText(""); }}
                                className="text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                aria-label="Cerrar"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <pre className="text-[11px] text-[var(--text-secondary)] bg-surface-2 rounded-lg px-3 py-2 border border-border-light select-all overflow-x-auto leading-relaxed">
{`"nombre","descripcion","activo"
"PANADERÍA","Productos de panadería","true"
"LÁCTEOS","","true"`}
                        </pre>
                        <textarea
                            className="w-full h-40 px-3 py-2 rounded-lg border border-border-default bg-surface-2 outline-none font-mono text-[12px] text-foreground focus:border-primary-500 hover:border-border-medium transition-colors resize-none"
                            placeholder={"\"nombre\",\"descripcion\",\"activo\"\n\"PANADERÍA\",\"\",\"true\""}
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                        />
                        <div className="flex items-center gap-3 pt-1 border-t border-border-light">
                            <div className="ml-auto flex items-center gap-2">
                                <BaseButton.Root variant="secondary" size="sm" onClick={() => { setPasteOpen(false); setPasteText(""); }}>
                                    Cancelar
                                </BaseButton.Root>
                                <BaseButton.Root variant="primary" size="sm" onClick={handlePasteParse} isDisabled={!pasteText.trim()}>
                                    Procesar
                                </BaseButton.Root>
                            </div>
                        </div>
                    </div>
                )}

                {/* Import preview */}
                {importResult && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-3 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-lg border border-success/30 bg-success/10 text-text-success flex items-center justify-center flex-shrink-0">
                                <CheckCircle2 size={14} />
                            </div>
                            <div>
                                <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    Vista previa de importación
                                </p>
                                {importResult.departments.length > 0 && (
                                    <p className="font-sans text-[12px] text-[var(--text-secondary)]">
                                        {importResult.departments.length} departamento(s) listos para importar.
                                    </p>
                                )}
                            </div>
                        </div>
                        {importResult.errors.length > 0 && (
                            <ul className="space-y-1 pl-1 border-l-2 border-error/30 ml-1">
                                {importResult.errors.map((e, i) => (
                                    <li key={i} className="font-sans text-[13px] text-text-error pl-3">{e}</li>
                                ))}
                            </ul>
                        )}
                        <div className="flex items-center gap-2 pt-1 border-t border-border-light">
                            <BaseButton.Root variant="secondary" size="sm" onClick={() => setImportResult(null)}>
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root variant="primary" size="sm" onClick={handleImport} isDisabled={importing || importResult.departments.length === 0} loading={importing}>
                                {importing ? "Importando…" : `Importar ${importResult.departments.length}`}
                            </BaseButton.Root>
                        </div>
                    </div>
                )}

                {/* Form panel */}
                {form && (
                    <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-border-light flex items-center gap-3 bg-surface-2/40">
                            <div className="h-9 w-9 rounded-lg border border-primary-500/20 bg-primary-500/10 text-primary-500 flex items-center justify-center flex-shrink-0">
                                {form.id ? <Pencil size={15} /> : <Plus size={16} strokeWidth={2.5} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 className="text-[14px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    {form.id ? "Editar departamento" : "Nuevo departamento"}
                                </h2>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                    {form.id
                                        ? "Actualiza nombre, descripción o estado del departamento."
                                        : "Crea una categoría para clasificar tus productos. El nombre se guarda en mayúsculas."}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeForm}
                                className="text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                aria-label="Cerrar"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-1">
                            <FormSection icon={Tag} title="Identidad" description="Nombre visible en filtros, productos y reportes.">
                                <BaseInput.Field
                                    label="Nombre"
                                    isRequired
                                    type="text"
                                    value={form.name}
                                    onValueChange={(v) => set("name", v.toUpperCase())}
                                    placeholder="Ej: PANADERÍA"
                                />
                            </FormSection>

                            <FormSection icon={AlignLeft} title="Descripción" description="Detalle opcional para distinguir departamentos similares.">
                                <textarea
                                    className={`${fieldCls} h-auto py-2 leading-relaxed`}
                                    rows={3}
                                    value={form.description ?? ""}
                                    onChange={(e) => set("description", e.target.value)}
                                    placeholder="Productos de panadería, harinas y derivados…"
                                />
                            </FormSection>

                            <FormSection icon={CheckCircle2} title="Estado" description="Los departamentos inactivos no aparecen al asignar productos nuevos.">
                                <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                                    <span className="relative inline-flex">
                                        <input
                                            type="checkbox"
                                            checked={form.active}
                                            onChange={(e) => set("active", e.target.checked)}
                                            className="peer sr-only"
                                        />
                                        <span className="w-10 h-6 rounded-full border border-border-default bg-surface-2 peer-checked:bg-primary-500 peer-checked:border-primary-500 transition-colors duration-150" />
                                        <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-150 peer-checked:translate-x-4" />
                                    </span>
                                    <span className="font-mono text-[13px] text-foreground">
                                        {form.active ? "Activo" : "Inactivo"}
                                    </span>
                                </label>
                            </FormSection>

                            {form.id && (productCountByDept.get(form.id) ?? 0) > 0 && (
                                <div className="mt-2 px-4 py-3 rounded-lg border border-info/30 bg-info/[0.05] text-text-info text-[13px] flex items-start gap-3">
                                    <Package size={16} className="flex-shrink-0 mt-[1px]" />
                                    <span className="font-sans">
                                        Hay <strong className="font-mono tabular-nums">{productCountByDept.get(form.id)}</strong> producto(s) asignado(s) a este departamento.
                                        Si lo desactivas, esos productos seguirán existiendo pero no podrás asignar nuevos.
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-3 border-t border-border-light flex items-center justify-end gap-2 bg-surface-2/40">
                            <BaseButton.Root variant="secondary" size="md" onClick={closeForm} isDisabled={saving}>
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root variant="primary" size="md" onClick={handleSave} isDisabled={saving} loading={saving}>
                                {saving ? "Guardando…" : (form.id ? "Guardar cambios" : "Crear departamento")}
                            </BaseButton.Root>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden shadow-sm">
                    {loadingDepartments ? (
                        <div className="px-6 py-16 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando departamentos…
                        </div>
                    ) : departments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-8 py-16 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Layers size={22} strokeWidth={1.8} />
                            </div>
                            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">Sin departamentos</p>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] max-w-[360px]">
                                Crea departamentos para clasificar tus productos por área, categoría o línea.
                            </p>
                            <BaseButton.Root variant="primary" size="sm" onClick={openNew} leftIcon={<Plus size={14} strokeWidth={2.5} />}>
                                Nuevo departamento
                            </BaseButton.Root>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-8 py-16 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Search size={22} strokeWidth={1.8} />
                            </div>
                            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">Sin resultados</p>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] max-w-[360px]">
                                Ningún departamento coincide con los filtros actuales.
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
                                                className="w-4 h-4 rounded"
                                                checked={filtered.length > 0 && filtered.every((item) => selected.has(item.id!))}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelected(new Set(filtered.map((item) => item.id!)));
                                                    else setSelected(new Set());
                                                }}
                                                aria-label="Seleccionar todos"
                                            />
                                        </th>
                                        {[
                                            { label: "Nombre",      align: "text-left"  },
                                            { label: "Descripción", align: "text-left"  },
                                            { label: "Productos",   align: "text-right" },
                                            { label: "Estado",      align: "text-left"  },
                                            { label: "",            align: "text-right" },
                                        ].map((h) => (
                                            <th
                                                key={h.label}
                                                className={`px-4 h-10 ${h.align} text-[12px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] font-medium whitespace-nowrap`}
                                            >
                                                {h.label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((d) => {
                                        const productCount = d.id ? (productCountByDept.get(d.id) ?? 0) : 0;
                                        return (
                                            <tr key={d.id} className={[
                                                "border-b border-border-light/60 transition-colors",
                                                selected.has(d.id!) ? "bg-primary-500/5 hover:bg-primary-500/10" : "hover:bg-surface-2/60",
                                            ].join(" ")}>
                                                <td className="px-4 py-3 w-10">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 rounded"
                                                        checked={selected.has(d.id!)}
                                                        onChange={(e) => {
                                                            const next = new Set(selected);
                                                            if (e.target.checked) next.add(d.id!);
                                                            else next.delete(d.id!);
                                                            setSelected(next);
                                                        }}
                                                        aria-label={`Seleccionar ${d.name}`}
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-foreground font-medium">
                                                    <span className="inline-flex items-center gap-2">
                                                        <FolderOpen size={14} className="text-[var(--text-tertiary)] flex-shrink-0" />
                                                        {d.name}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-[var(--text-secondary)] font-sans">
                                                    {d.description || <span className="text-[var(--text-tertiary)] font-mono">—</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right tabular-nums">
                                                    {productCount > 0 ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-border-light bg-surface-2 text-foreground text-[12px] font-medium">
                                                            <Package size={11} className="text-[var(--text-tertiary)]" />
                                                            {productCount}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[var(--text-tertiary)] text-[12px]">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {d.active ? (
                                                        <span className="inline-flex items-center gap-1.5 text-text-success text-[11px] uppercase tracking-[0.12em] font-medium">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-text-success" />
                                                            Activo
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-[var(--text-tertiary)] text-[11px] uppercase tracking-[0.12em] font-medium">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                                                            Inactivo
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {confirmDelete === d.id ? (
                                                            <div className="flex items-center gap-2 px-2">
                                                                <span className="font-sans text-[12px] text-[var(--text-secondary)] hidden sm:inline">¿Eliminar?</span>
                                                                <button
                                                                    onClick={() => handleDelete(d.id!)}
                                                                    disabled={deletingId === d.id}
                                                                    className="font-mono text-[11px] uppercase tracking-[0.10em] text-text-error hover:text-error transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                >
                                                                    {deletingId === d.id ? "Eliminando…" : "Confirmar"}
                                                                </button>
                                                                <button
                                                                    onClick={() => setConfirmDelete(null)}
                                                                    disabled={deletingId === d.id}
                                                                    className="font-mono text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-foreground transition-colors disabled:opacity-50"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => openEdit(d)}
                                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                                                                    aria-label={`Editar ${d.name}`}
                                                                    title="Editar"
                                                                >
                                                                    <Pencil size={14} />
                                                                </button>
                                                                <button
                                                                    onClick={() => setConfirmDelete(d.id!)}
                                                                    disabled={!!deletingId}
                                                                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                                                                    aria-label={`Eliminar ${d.name}`}
                                                                    title="Eliminar"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
