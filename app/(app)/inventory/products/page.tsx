"use client";

// Products catalog page — CRUD, CSV import/export, bulk delete.
// Uses English domain types (Product) and English useInventory() API.

import { useEffect, useRef, useState } from "react";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { CustomFieldDefinition } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import type { Product, ProductType, MeasureUnit, ValuationMethod, VatType } from "@/src/modules/inventory/backend/domain/product";
import {
    productsToCsv,
    parseProductsCsv,
    downloadCsv,
    type ProductCsvResult,
} from "@/src/modules/inventory/frontend/utils/inventory-csv";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const TIPOS: { value: ProductType; label: string }[] = [
    { value: "mercancia",          label: "Mercancía"         },
    { value: "materia_prima",      label: "Materia Prima"     },
    { value: "producto_terminado", label: "Producto Terminado"},
];

const UNIDADES: { value: MeasureUnit; label: string }[] = [
    { value: "unidad", label: "Unidad" },
    { value: "kg",     label: "Kg"     },
    { value: "g",      label: "g"      },
    { value: "m",      label: "m"      },
    { value: "m2",     label: "m²"     },
    { value: "m3",     label: "m³"     },
    { value: "litro",  label: "Litro"  },
    { value: "caja",    label: "Caja"    },
    { value: "rollo",   label: "Rollo"   },
    { value: "paquete", label: "Paquete" },
];

const METODOS: { value: ValuationMethod; label: string }[] = [
    { value: "promedio_ponderado", label: "Promedio Ponderado" },
];

const IVA_TIPOS: { value: VatType; label: string }[] = [
    { value: "general", label: "General (G - 16%)" },
    { value: "exento",  label: "Exento (E)"         },
];

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
        mercancia:          { label: "Mercancía",       cls: "border badge-info"    },
        materia_prima:      { label: "Mat. Prima",      cls: "border badge-warning" },
        producto_terminado: { label: "Prod. Terminado", cls: "border badge-success" },
    };
    const { label, cls } = map[tipo] ?? { label: tipo, cls: "bg-surface-2 text-text-secondary border border-border-light" };
    return (
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium ${cls}`}>
            {label}
        </span>
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
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

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
        await deleteProduct(id);
        setDeletingId(null);
        setConfirmDelete(null);
    }

    async function handleBulkDelete() {
        setBulkDeleting(true);
        for (const id of selected) {
            await deleteProduct(id);
        }
        setBulkDeleting(false);
        setSelected(new Set());
        setConfirmBulkDelete(false);
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

    const filtered = products.filter(p => [p.code, p.name, p.departmentName ?? ""].join(" ").toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Productos" subtitle="Catálogo de productos">
                <BaseButton.Root variant="secondary" size="sm" onClick={handleExport} isDisabled={products.length === 0}>
                    Exportar CSV
                </BaseButton.Root>
                <BaseButton.Root variant="secondary" size="sm" onClick={() => { setPasteOpen((v) => !v); setError(null); }}>
                    Pegar CSV
                </BaseButton.Root>
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    isDisabled={loadingDepartments}
                    title={loadingDepartments ? "Cargando departamentos…" : undefined}
                >
                    Importar archivo
                </BaseButton.Root>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                <Link href="/inventory/import">
                    <BaseButton.Root variant="secondary" size="sm">
                        Importar Excel
                    </BaseButton.Root>
                </Link>
                <BaseButton.Root variant="primary" size="sm" onClick={openNew}>
                    + Nuevo producto
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-4">
                {/* Search + bulk actions */}
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Buscar…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setSelected(new Set()); }}
                        className="h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground placeholder:text-text-tertiary focus:border-primary-500/60 hover:border-border-medium transition-colors w-64"
                    />
                    {selected.size > 0 && (
                        confirmBulkDelete ? (
                            <div className="flex items-center gap-2">
                                <span className="text-[12px] text-foreground">¿Eliminar {selected.size} elemento(s)?</span>
                                <BaseButton.Root variant="danger" size="md" onClick={handleBulkDelete} isDisabled={bulkDeleting} loading={bulkDeleting}>
                                    {bulkDeleting ? "Eliminando…" : "Confirmar"}
                                </BaseButton.Root>
                                <BaseButton.Root variant="secondary" size="md" onClick={() => setConfirmBulkDelete(false)} isDisabled={bulkDeleting}>
                                    Cancelar
                                </BaseButton.Root>
                            </div>
                        ) : (
                            <BaseButton.Root variant="dangerOutline" size="md" onClick={() => setConfirmBulkDelete(true)}>
                                Eliminar {selected.size} seleccionado(s)
                            </BaseButton.Root>
                        )
                    )}
                </div>

                {/* Error */}
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                {/* Paste CSV panel */}
                {pasteOpen && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-3">
                        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-foreground">
                            Pegar CSV
                        </p>
                        <p className="text-[11px] text-text-tertiary">
                            Formato esperado — primera fila debe ser el encabezado:
                        </p>
                        <pre className="text-[11px] text-text-secondary bg-surface-2 rounded-lg px-3 py-2 border border-border-light select-all overflow-x-auto">
{`"codigo","nombre","descripcion","tipo","unidad_medida","metodo_valuacion","iva_tipo","activo","departamento_nombre","moneda_defecto"
"P001","Harina de Trigo","","mercancia","kg","promedio_ponderado","general","true","PANADERÍA","B"`}
                        </pre>
                        <textarea
                            className="w-full h-40 px-3 py-2 rounded-lg border border-border-light bg-surface-2 outline-none font-mono text-[12px] text-foreground focus:border-primary-500/60 hover:border-border-medium transition-colors resize-none"
                            placeholder={`"codigo","nombre","descripcion","tipo","unidad_medida","metodo_valuacion","iva_tipo","activo","departamento_nombre","moneda_defecto"`}
                            value={pasteText}
                            onChange={(e) => setPasteText(e.target.value)}
                        />
                        <div className="flex items-center gap-3 pt-1 border-t border-border-light">
                            {loadingDepartments ? (
                                <span className="text-[12px] text-text-tertiary">Cargando departamentos…</span>
                            ) : (
                                <span className="text-[12px] text-text-tertiary">{departments.length} departamento(s) disponible(s)</span>
                            )}
                            <BaseButton.Root variant="primary" size="sm" onClick={handlePasteParse} isDisabled={!pasteText.trim() || loadingDepartments}>
                                Procesar
                            </BaseButton.Root>
                            <BaseButton.Root variant="secondary" size="sm" onClick={() => { setPasteOpen(false); setPasteText(""); }}>
                                Cancelar
                            </BaseButton.Root>
                        </div>
                    </div>
                )}

                {/* Import preview */}
                {importResult && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-3">
                        <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-foreground">
                            Vista previa de importación
                        </p>
                        {importResult.errors.length > 0 && (
                            <ul className="space-y-1">
                                {importResult.errors.map((e, i) => (
                                    <li key={i} className="text-[13px] text-red-500">{e}</li>
                                ))}
                            </ul>
                        )}
                        {importResult.products.length > 0 && (
                            <p className="text-[13px] text-[var(--text-secondary)]">
                                {importResult.products.length} producto(s) listos para importar.
                            </p>
                        )}
                        <div className="flex items-center gap-3 pt-1 border-t border-border-light">
                            <BaseButton.Root variant="primary" size="sm" onClick={handleImport} isDisabled={importing || importResult.products.length === 0} loading={importing}>
                                {importing ? "Importando…" : `Importar ${importResult.products.length}`}
                            </BaseButton.Root>
                            <BaseButton.Root variant="secondary" size="sm" onClick={() => setImportResult(null)}>
                                Cancelar
                            </BaseButton.Root>
                        </div>
                    </div>
                )}

                {/* Form panel */}
                {form && (
                    <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                        <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                            {form.id ? "Editar producto" : "Nuevo producto"}
                        </h2>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className={labelCls}>Código</label>
                                <input className={fieldCls} value={form.code} onChange={(e) => set("code", e.target.value)} />
                            </div>
                            <div className="col-span-2">
                                <label className={labelCls}>Nombre *</label>
                                <input className={fieldCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className={labelCls}>Descripción</label>
                            <input className={fieldCls} value={form.description} onChange={(e) => set("description", e.target.value)} />
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
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

                        <div className="grid grid-cols-3 gap-4 mb-4">
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

                        {/* Custom fields from sector template */}
                        {customFields.length > 0 && (
                            <div className="mb-4">
                                <p className={labelCls + " mb-3"}>Campos adicionales</p>
                                <div className="grid grid-cols-3 gap-4">
                                    {customFields.map((cf) => {
                                        const cfVal = (form.customFields ?? {})[cf.key] ?? "";
                                        return (
                                            <div key={cf.key}>
                                                <label className={labelCls}>{cf.label}</label>
                                                {cf.type === "select" ? (
                                                    <select
                                                        className={fieldCls}
                                                        value={String(cfVal)}
                                                        onChange={(e) => setForm(f => f ? {
                                                            ...f,
                                                            customFields: { ...(f.customFields ?? {}), [cf.key]: e.target.value || null },
                                                        } : f)}
                                                    >
                                                        <option value="">—</option>
                                                        {(cf.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
                                                    </select>
                                                ) : (
                                                    <input
                                                        className={fieldCls}
                                                        type={cf.type === "number" ? "number" : cf.type === "date" ? "date" : "text"}
                                                        value={String(cfVal)}
                                                        onChange={(e) => setForm(f => f ? {
                                                            ...f,
                                                            customFields: {
                                                                ...(f.customFields ?? {}),
                                                                [cf.key]: cf.type === "number"
                                                                    ? (e.target.value === "" ? null : Number(e.target.value))
                                                                    : (e.target.value || null),
                                                            },
                                                        } : f)}
                                                    />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox" checked={form.active}
                                    onChange={(e) => set("active", e.target.checked)}
                                    className="w-4 h-4 rounded"
                                />
                                <span className="text-[14px] text-foreground">Activo</span>
                            </label>
                        </div>

                        <div className="flex items-center gap-3 pt-2 border-t border-border-light">
                            <BaseButton.Root variant="primary" size="sm" onClick={handleSave} isDisabled={saving} loading={saving}>
                                {saving ? "Guardando…" : "Guardar"}
                            </BaseButton.Root>
                            <BaseButton.Root variant="secondary" size="sm" onClick={closeForm}>
                                Cancelar
                            </BaseButton.Root>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    {loadingProducts ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">Cargando…</div>
                    ) : products.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[13px] text-[var(--text-tertiary)]">
                            No hay productos. Haz clic en &quot;+ Nuevo producto&quot; para crear uno.
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[13px] text-text-tertiary">Sin resultados para &quot;{search}&quot;.</div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    <th className="px-4 py-2.5 w-8">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded"
                                            checked={filtered.length > 0 && filtered.every(item => selected.has(item.id!))}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelected(new Set(filtered.map(item => item.id!)));
                                                else setSelected(new Set());
                                            }}
                                        />
                                    </th>
                                    {["Código", "Nombre", "Departamento", "IVA", "Tipo", "Unidad", "Existencia", "Estado",
                                      ...customFields.map(cf => cf.label),
                                      ""].map((h, idx) => (
                                        <th key={idx} className="px-4 py-2.5 text-left text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((p) => (
                                        <tr key={p.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                            <td className="px-4 py-2.5 w-8">
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
                                                />
                                            </td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.code || "—"}</td>
                                            <td className="px-4 py-2.5 text-foreground font-medium">{p.name}</td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.departmentName || "—"}</td>
                                            <td className="px-4 py-2.5">
                                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] uppercase tracking-[0.08em] font-medium ${p.vatType === "exento" ? "border badge-info" : "border badge-warning"}`}>
                                                    {p.vatType === "exento" ? "E" : "G 16%"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5"><TipoBadge tipo={p.type} /></td>
                                            <td className="px-4 py-2.5 text-[var(--text-secondary)]">{p.measureUnit}</td>
                                            <td className="px-4 py-2.5 tabular-nums font-medium text-foreground">
                                                {fmtN(p.currentStock)}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {p.active
                                                    ? <span className="text-text-success text-[11px] uppercase tracking-[0.10em]">Activo</span>
                                                    : <span className="text-text-tertiary text-[11px] uppercase tracking-[0.10em]">Inactivo</span>
                                                }
                                            </td>
                                            {customFields.map(cf => (
                                                <td key={cf.key} className="px-4 py-2.5 text-[var(--text-secondary)]">
                                                    {p.customFields?.[cf.key] != null ? String(p.customFields[cf.key]) : "—"}
                                                </td>
                                            ))}
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => openEdit(p)}
                                                        className="text-[11px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-colors"
                                                    >
                                                        Editar
                                                    </button>
                                                    {confirmDelete === p.id ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleDelete(p.id!)}
                                                                disabled={deletingId === p.id}
                                                                className="text-[11px] uppercase tracking-[0.10em] text-red-500 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {deletingId === p.id ? "Eliminando…" : "Confirmar"}
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmDelete(null)}
                                                                disabled={deletingId === p.id}
                                                                className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button
                                                            onClick={() => setConfirmDelete(p.id!)}
                                                            disabled={!!deletingId}
                                                            className="text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-red-500 transition-colors disabled:opacity-50"
                                                        >
                                                            Eliminar
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
