"use client";

// Products catalog page — CRUD, CSV import/export, bulk delete.
// Uses English domain types (Product) and English useInventory() API.

import { useEffect, useMemo, useRef, useState } from "react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { CustomFieldDefinition } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import type { Product, ProductType, MeasureUnit, ValuationMethod, VatType } from "@/src/modules/inventory/backend/domain/product";
import {
    productsToCsv,
    parseProductsCsv,
    downloadCsv,
    type ProductCsvResult,
} from "@/src/modules/inventory/frontend/utils/inventory-csv";
import {
    Package,
    Plus,
    Search,
    Download,
    Upload,
    ClipboardPaste,
    FileSpreadsheet,
    Pencil,
    Trash2,
    X,
    AlertCircle,
    Info,
    Tag,
    Boxes,
    Layers,
    Receipt,
    SlidersHorizontal,
    PackageCheck,
    PackageX,
    CheckCircle2,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-default bg-surface-1 outline-none",
    "font-mono text-[15px] text-foreground tabular-nums",
    "focus:border-primary-500 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[12px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const TIPOS: { value: ProductType; label: string }[] = [
    { value: "mercancia", label: "Mercancía" },
];

const UNIDADES: { value: MeasureUnit; label: string }[] = [
    { value: "unidad",  label: "Unidad"  },
    { value: "kg",      label: "Kg"      },
    { value: "g",       label: "g"       },
    { value: "m",       label: "m"       },
    { value: "m2",      label: "m²"      },
    { value: "m3",      label: "m³"      },
    { value: "litro",   label: "Litro"   },
    { value: "caja",    label: "Caja"    },
    { value: "rollo",   label: "Rollo"   },
    { value: "paquete", label: "Paquete" },
];

const METODOS: { value: ValuationMethod; label: string }[] = [
    { value: "promedio_ponderado", label: "Promedio Ponderado" },
];

const IVA_TIPOS: { value: VatType; label: string }[] = [
    { value: "general", label: "General — alícuota 16%" },
    { value: "exento",  label: "Exento — sin alícuota"  },
];

type EstadoFilter = "todos" | "activo" | "inactivo";

function empty(companyId: string): Product {
    return {
        companyId,
        code:            "",
        name:            "",
        description:     "",
        type:            "mercancia",
        measureUnit:     "unidad",
        valuationMethod: "promedio_ponderado",
        currentStock:    0,
        averageCost:     0,
        active:          true,
        vatType:         "general",
        departmentId:    undefined,
    };
}

function TipoBadge({ tipo }: { tipo: string }) {
    const map: Record<string, { label: string; cls: string }> = {
        mercancia: { label: "Mercancía", cls: "border badge-info" },
    };
    const { label, cls } = map[tipo] ?? { label: tipo, cls: "bg-surface-2 text-text-secondary border border-border-light" };
    return (
        <span className={`inline-flex px-2 py-0.5 rounded text-[11px] uppercase tracking-[0.10em] font-medium ${cls}`}>
            {label}
        </span>
    );
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

export default function ProductosPage() {
    const { companyId, company } = useCompany();
    const {
        products, loadingProducts, error, setError,
        loadProducts, saveProduct, deleteProduct,
        departments, loadingDepartments, loadDepartments,
    } = useInventory();

    // Custom fields from company inventory config (sector template + user-defined)
    const customFields: CustomFieldDefinition[] = company?.inventoryConfig?.customFields ?? [];

    const [form, setForm] = useState<Product | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<ProductCsvResult | null>(null);
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
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if (companyId) {
            loadProducts(companyId);
            loadDepartments(companyId);
        }
    }, [companyId, loadProducts, loadDepartments]);

    function openNew() {
        if (!companyId) return;
        setForm(empty(companyId));
        setError(null);
    }

    function openEdit(p: Product) {
        setForm({
            ...p,
            // peps is no longer supported; treat it as promedio_ponderado
            valuationMethod: p.valuationMethod === "peps" ? "promedio_ponderado" : p.valuationMethod,
        });
        setError(null);
    }

    function closeForm() { setForm(null); setError(null); }

    async function handleSave() {
        if (!form) return;
        if (!form.name.trim()) { setError("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveProduct(form);
        setSaving(false);
        if (saved) closeForm();
    }

    async function handleDelete(id: string) {
        setDeletingId(id);
        setNotice(null);
        const result = await deleteProduct(id);
        setDeletingId(null);
        setConfirmDelete(null);
        if (result.ok && result.softDeleted) {
            setNotice("El producto tiene historial (movimientos, facturas o producción) y no puede eliminarse. Se marcó como inactivo.");
        }
    }

    async function handleBulkDelete() {
        setBulkDeleting(true);
        setNotice(null);
        let softCount = 0;
        for (const id of selected) {
            const r = await deleteProduct(id);
            if (r.ok && r.softDeleted) softCount++;
        }
        setBulkDeleting(false);
        setSelected(new Set());
        setConfirmBulkDelete(false);
        if (softCount > 0) {
            setNotice(`${softCount} producto(s) con historial fueron marcados como inactivos en lugar de eliminados.`);
        }
    }

    const set = (k: keyof Product, v: string | number | boolean | null) =>
        setForm((f) => f ? { ...f, [k]: v } : f);

    function handleExport() {
        downloadCsv(productsToCsv(products), "productos.csv");
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = parseProductsCsv(ev.target?.result as string, departments);
            setImportResult(result);
        };
        reader.readAsText(file, "utf-8");
        e.target.value = "";
    }

    function handlePasteParse() {
        if (!pasteText.trim()) return;
        const result = parseProductsCsv(pasteText, departments);
        setImportResult(result);
        setPasteOpen(false);
        setPasteText("");
    }

    async function handleImport() {
        if (!importResult || !companyId) return;
        setImporting(true);
        for (const p of importResult.products) {
            // If a product with this code already exists, update it (avoid duplicates)
            const existing = p.code ? products.find((x) => x.code === p.code) : undefined;
            await saveProduct({
                ...p,
                id:           existing?.id,
                companyId,
                currentStock: existing?.currentStock ?? 0,
                averageCost:  existing?.averageCost ?? 0,
            });
        }
        setImporting(false);
        setImportResult(null);
        loadProducts(companyId);
    }

    // ── derived ─────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const active   = products.filter((p) => p.active).length;
        const inactive = products.length - active;
        const departmentsUsed = new Set(products.filter((p) => p.departmentId).map((p) => p.departmentId)).size;
        return { total: products.length, active, inactive, departmentsUsed };
    }, [products]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return products.filter((p) => {
            if (estadoFilter === "activo"   && !p.active) return false;
            if (estadoFilter === "inactivo" &&  p.active) return false;
            if (!q) return true;
            return [p.code, p.name, p.description ?? "", p.departmentName ?? ""]
                .join(" ").toLowerCase().includes(q);
        });
    }, [products, search, estadoFilter]);

    const hasFilters = search.trim() !== "" || estadoFilter !== "todos";
    function clearFilters() {
        setSearch("");
        setEstadoFilter("todos");
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Productos" subtitle="Catálogo · existencias · IVA">
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={handleExport}
                    isDisabled={products.length === 0}
                    leftIcon={<Download size={14} />}
                >
                    Exportar
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={() => { setPasteOpen((v) => !v); setError(null); }}
                    leftIcon={<ClipboardPaste size={14} />}
                >
                    Pegar CSV
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={() => fileRef.current?.click()}
                    isDisabled={loadingDepartments}
                    title={loadingDepartments ? "Cargando departamentos…" : undefined}
                    leftIcon={<Upload size={14} />}
                >
                    Importar CSV
                </BaseButton.Root>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                <BaseButton.Root as={Link} href="/inventory/import" variant="secondary" size="sm" leftIcon={<FileSpreadsheet size={14} />}>
                    Importar Excel
                </BaseButton.Root>
                <BaseButton.Root variant="primary" size="sm" onClick={openNew} leftIcon={<Plus size={14} strokeWidth={2.5} />}>
                    Nuevo producto
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-5">

                {/* KPI strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatTile label="Total productos"  value={stats.total}            icon={Package}      tone="primary"  />
                    <StatTile label="Activos"          value={stats.active}           icon={PackageCheck} tone="success"  sublabel={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% del catálogo` : "Sin productos"} />
                    <StatTile label="Inactivos"        value={stats.inactive}         icon={PackageX}     tone="muted"    />
                    <StatTile label="Departamentos"    value={stats.departmentsUsed}  icon={Layers}       tone="default"  sublabel={`de ${departments.length} disponible(s)`} />
                </div>

                {/* Toolbar */}
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm">
                    <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                        <div className="relative w-full sm:w-72">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                            <input
                                type="text"
                                placeholder="Buscar por código, nombre, departamento…"
                                value={search}
                                onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
                                className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-default bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-[var(--text-tertiary)] focus:border-primary-500 hover:border-border-medium transition-colors"
                            />
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-tertiary)] mr-1 hidden md:inline">Estado</span>
                            <FilterChip active={estadoFilter === "todos"}    onClick={() => setEstadoFilter("todos")}>Todos</FilterChip>
                            <FilterChip active={estadoFilter === "activo"}   onClick={() => setEstadoFilter("activo")}>Activos</FilterChip>
                            <FilterChip active={estadoFilter === "inactivo"} onClick={() => setEstadoFilter("inactivo")}>Inactivos</FilterChip>
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
                                <span className="text-foreground font-semibold">{filtered.length}</span> / {products.length}
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
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-error/30 bg-error/[0.05] text-text-error text-[13px] flex items-start gap-3">
                        <AlertCircle size={16} className="flex-shrink-0 mt-[1px]" />
                        <span className="font-sans">{error}</span>
                    </div>
                )}

                {/* Notice (soft-delete, etc.) */}
                {notice && (
                    <div className="px-4 py-3 rounded-lg border border-warning/30 bg-warning/[0.05] text-text-warning text-[13px] flex items-start gap-3">
                        <Info size={16} className="flex-shrink-0 mt-[1px]" />
                        <span className="flex-1 font-sans">{notice}</span>
                        <button
                            type="button"
                            onClick={() => setNotice(null)}
                            className="text-[11px] uppercase tracking-[0.12em] text-text-warning/70 hover:text-text-warning transition-colors"
                        >
                            Cerrar
                        </button>
                    </div>
                )}

                {/* Paste CSV panel */}
                {pasteOpen && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                    Pegar CSV
                                </p>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)] mt-0.5">
                                    La primera fila debe ser el encabezado.
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
{`"codigo","nombre","descripcion","tipo","unidad_medida","metodo_valuacion","iva_tipo","activo","departamento_nombre","moneda_defecto"
"P001","Harina de Trigo","","mercancia","kg","promedio_ponderado","general","true","PANADERÍA","B"`}
                        </pre>
                        <textarea
                            className="w-full h-40 px-3 py-2 rounded-lg border border-border-default bg-surface-2 outline-none font-mono text-[12px] text-foreground focus:border-primary-500 hover:border-border-medium transition-colors resize-none"
                            placeholder={`"codigo","nombre","descripcion","tipo","unidad_medida","metodo_valuacion","iva_tipo","activo","departamento_nombre","moneda_defecto"`}
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                        />
                        <div className="flex items-center gap-3 pt-1 border-t border-border-light">
                            {loadingDepartments ? (
                                <span className="font-sans text-[12px] text-[var(--text-tertiary)]">Cargando departamentos…</span>
                            ) : (
                                <span className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                    {departments.length} departamento(s) disponible(s)
                                </span>
                            )}
                            <div className="ml-auto flex items-center gap-2">
                                <BaseButton.Root variant="secondary" size="sm" onClick={() => { setPasteOpen(false); setPasteText(""); }}>
                                    Cancelar
                                </BaseButton.Root>
                                <BaseButton.Root variant="primary" size="sm" onClick={handlePasteParse} isDisabled={!pasteText.trim() || loadingDepartments}>
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
                                {importResult.products.length > 0 && (
                                    <p className="font-sans text-[12px] text-[var(--text-secondary)]">
                                        {importResult.products.length} producto(s) listos para importar.
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
                            <BaseButton.Root variant="primary" size="sm" onClick={handleImport} isDisabled={importing || importResult.products.length === 0} loading={importing}>
                                {importing ? "Importando…" : `Importar ${importResult.products.length}`}
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
                                    {form.id ? "Editar producto" : "Nuevo producto"}
                                </h2>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                    {form.id ? "Actualiza los datos y guarda los cambios." : "Crea un producto del catálogo. Las existencias se cargan desde compras o ajustes."}
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
                            <FormSection icon={Tag} title="Identidad" description="Código interno y nombre comercial.">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <BaseInput.Field
                                        label="Código"
                                        type="text"
                                        value={form.code}
                                        onValueChange={(v) => set("code", v)}
                                        placeholder="P001"
                                    />
                                    <BaseInput.Field
                                        label="Nombre"
                                        isRequired
                                        type="text"
                                        value={form.name}
                                        onValueChange={(v) => set("name", v)}
                                        className="md:col-span-2"
                                        placeholder="Ej: Harina de Trigo 1kg"
                                    />
                                </div>
                                <div className="mt-4">
                                    <BaseInput.Field
                                        label="Descripción"
                                        type="text"
                                        value={form.description}
                                        onValueChange={(v) => set("description", v)}
                                        placeholder="Detalle opcional del producto"
                                    />
                                </div>
                            </FormSection>

                            <FormSection icon={Boxes} title="Clasificación" description="Tipo, unidad de medida y método de valuación.">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className={labelCls}>Tipo</label>
                                        <select className={fieldCls} value={form.type} onChange={(e) => set("type", e.target.value as ProductType)}>
                                            {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Unidad de medida</label>
                                        <select className={fieldCls} value={form.measureUnit} onChange={(e) => set("measureUnit", e.target.value as MeasureUnit)}>
                                            {UNIDADES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Método de valuación</label>
                                        <select className={fieldCls} value={form.valuationMethod} onChange={(e) => set("valuationMethod", e.target.value as ValuationMethod)}>
                                            {METODOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </FormSection>

                            <FormSection icon={Receipt} title="Departamento e IVA" description="Categoría y régimen fiscal del producto.">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className={labelCls}>Departamento</label>
                                        <select
                                            className={fieldCls}
                                            value={form.departmentId ?? ""}
                                            onChange={(e) => set("departmentId", e.target.value || null)}
                                            disabled={loadingDepartments}
                                        >
                                            <option value="">Sin departamento</option>
                                            {departments.filter((d) => d.active).map((d) => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>IVA</label>
                                        <select className={fieldCls} value={form.vatType ?? "general"} onChange={(e) => set("vatType", e.target.value as VatType)}>
                                            {IVA_TIPOS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </FormSection>

                            {customFields.length > 0 && (
                                <FormSection icon={SlidersHorizontal} title="Campos adicionales" description="Definidos por la plantilla del sector o por tu organización.">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {customFields.map((cf) => {
                                            const cfVal = (form.customFields ?? {})[cf.key] ?? "";
                                            return (
                                                <div key={cf.key}>
                                                    <label className={labelCls}>{cf.label}</label>
                                                    {cf.type === "select" ? (
                                                        <select
                                                            className={fieldCls}
                                                            value={String(cfVal)}
                                                            onChange={(e) => setForm((f) => f ? {
                                                                ...f,
                                                                customFields: { ...(f.customFields ?? {}), [cf.key]: e.target.value || null },
                                                            } : f)}
                                                        >
                                                            <option value="">—</option>
                                                            {(cf.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                                                        </select>
                                                    ) : (
                                                        <BaseInput.Field
                                                            type={cf.type === "number" ? "number" : cf.type === "date" ? "date" : "text"}
                                                            value={String(cfVal)}
                                                            onValueChange={(v) => setForm((f) => f ? {
                                                                ...f,
                                                                customFields: {
                                                                    ...(f.customFields ?? {}),
                                                                    [cf.key]: cf.type === "number"
                                                                        ? (v === "" ? null : Number(v))
                                                                        : (v || null),
                                                                },
                                                            } : f)}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </FormSection>
                            )}

                            <FormSection icon={CheckCircle2} title="Estado" description="Los productos inactivos no aparecen en compras ni ventas.">
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
                        </div>

                        <div className="px-6 py-3 border-t border-border-light flex items-center justify-end gap-2 bg-surface-2/40">
                            <BaseButton.Root variant="secondary" size="md" onClick={closeForm} isDisabled={saving}>
                                Cancelar
                            </BaseButton.Root>
                            <BaseButton.Root variant="primary" size="md" onClick={handleSave} isDisabled={saving} loading={saving}>
                                {saving ? "Guardando…" : (form.id ? "Guardar cambios" : "Crear producto")}
                            </BaseButton.Root>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden shadow-sm">
                    {loadingProducts ? (
                        <div className="px-6 py-16 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando productos…
                        </div>
                    ) : products.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-8 py-16 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Package size={22} strokeWidth={1.8} />
                            </div>
                            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">Catálogo vacío</p>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] max-w-[360px]">
                                Crea el primer producto para empezar a registrar compras y ventas.
                            </p>
                            <BaseButton.Root variant="primary" size="sm" onClick={openNew} leftIcon={<Plus size={14} strokeWidth={2.5} />}>
                                Nuevo producto
                            </BaseButton.Root>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-8 py-16 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Search size={22} strokeWidth={1.8} />
                            </div>
                            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">Sin resultados</p>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] max-w-[360px]">
                                Ningún producto coincide con los filtros actuales.
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
                                            { label: "Código",       align: "text-left"  },
                                            { label: "Nombre",       align: "text-left"  },
                                            { label: "Departamento", align: "text-left"  },
                                            { label: "IVA",          align: "text-center"},
                                            { label: "Tipo",         align: "text-left"  },
                                            { label: "Unidad",       align: "text-left"  },
                                            { label: "Existencia",   align: "text-right" },
                                            { label: "Estado",       align: "text-left"  },
                                            ...customFields.map((cf) => ({ label: cf.label, align: "text-left" })),
                                            { label: "",             align: "text-right" },
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
                                    {filtered.map((p) => (
                                        <tr key={p.id} className={[
                                            "border-b border-border-light/60 transition-colors",
                                            selected.has(p.id!) ? "bg-primary-500/5 hover:bg-primary-500/10" : "hover:bg-surface-2/60",
                                        ].join(" ")}>
                                            <td className="px-4 py-3 w-10">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded"
                                                    checked={selected.has(p.id!)}
                                                    onChange={(e) => {
                                                        const next = new Set(selected);
                                                        if (e.target.checked) next.add(p.id!);
                                                        else next.delete(p.id!);
                                                        setSelected(next);
                                                    }}
                                                    aria-label={`Seleccionar ${p.name}`}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">{p.code || "—"}</td>
                                            <td className="px-4 py-3 text-foreground font-medium">
                                                <div className="flex flex-col">
                                                    <span>{p.name}</span>
                                                    {p.description && (
                                                        <span className="font-sans text-[11px] text-[var(--text-tertiary)] truncate max-w-[280px]">
                                                            {p.description}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-[var(--text-secondary)]">{p.departmentName || "—"}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded text-[11px] uppercase tracking-[0.10em] font-medium ${p.vatType === "exento" ? "border badge-info" : "border badge-warning"}`}>
                                                    {p.vatType === "exento" ? "E" : "G 16%"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3"><TipoBadge tipo={p.type} /></td>
                                            <td className="px-4 py-3 text-[var(--text-secondary)]">{p.measureUnit}</td>
                                            <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
                                                {fmtN(p.currentStock)}
                                            </td>
                                            <td className="px-4 py-3">
                                                {p.active ? (
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
                                            {customFields.map((cf) => (
                                                <td key={cf.key} className="px-4 py-3 text-[var(--text-secondary)]">
                                                    {p.customFields?.[cf.key] != null ? String(p.customFields[cf.key]) : "—"}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {confirmDelete === p.id ? (
                                                        <div className="flex items-center gap-2 px-2">
                                                            <span className="font-sans text-[12px] text-[var(--text-secondary)] hidden sm:inline">¿Eliminar?</span>
                                                            <button
                                                                onClick={() => handleDelete(p.id!)}
                                                                disabled={deletingId === p.id}
                                                                className="font-mono text-[11px] uppercase tracking-[0.10em] text-text-error hover:text-error transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {deletingId === p.id ? "Eliminando…" : "Confirmar"}
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmDelete(null)}
                                                                disabled={deletingId === p.id}
                                                                className="font-mono text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-foreground transition-colors disabled:opacity-50"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => openEdit(p)}
                                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                                                                aria-label={`Editar ${p.name}`}
                                                                title="Editar"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmDelete(p.id!)}
                                                                disabled={!!deletingId}
                                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                                                                aria-label={`Eliminar ${p.name}`}
                                                                title="Eliminar"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
