"use client";

// Suppliers catalog page — CRUD, CSV import/export, bulk delete.
// Uses English domain types (Supplier) and English useInventory() API.

import { useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { notify } from "@/src/shared/frontend/notify";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import type { Supplier } from "@/src/modules/inventory/backend/domain/supplier";
import {
    suppliersToCsv,
    parseSuppliersCsv,
    downloadCsv,
    type SupplierCsvResult,
} from "@/src/modules/inventory/frontend/utils/inventory-csv";
import {
    Truck,
    Plus,
    Search,
    Download,
    Upload,
    ClipboardPaste,
    Pencil,
    Trash2,
    X,
    IdCard,
    PhoneCall,
    StickyNote,
    CheckCircle2,
    UserCheck,
    Mail,
    Phone,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-default bg-surface-1 outline-none",
    "font-mono text-[15px] text-foreground tabular-nums",
    "focus:border-primary-500 hover:border-border-medium transition-colors duration-150",
].join(" ");

type EstadoFilter = "todos" | "activo" | "inactivo";

function emptySupplier(companyId: string): Supplier {
    return {
        companyId,
        rif:     "",
        name:    "",
        contact: "",
        phone:   "",
        email:   "",
        address: "",
        notes:   "",
        active:  true,
    };
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

export default function ProveedoresPage() {
    const { companyId } = useCompany();
    const {
        suppliers, loadingSuppliers,
        loadSuppliers, saveSupplier, deleteSupplier,
    } = useInventory();

    const [form, setForm] = useState<Supplier | null>(null);
    const [saving, setSaving] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<SupplierCsvResult | null>(null);
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
        if (companyId) loadSuppliers(companyId);
    }, [companyId, loadSuppliers]);

    function openNew() {
        if (!companyId) return;
        setForm(emptySupplier(companyId));
    }

    function openEdit(s: Supplier) {
        setForm({ ...s });
    }

    function closeForm() { setForm(null); }

    async function handleSave() {
        if (!form) return;
        if (!form.name.trim()) { notify.error("El nombre es requerido"); return; }
        setSaving(true);
        const saved = await saveSupplier(form);
        setSaving(false);
        if (saved) closeForm();
    }

    async function handleDelete(id: string) {
        setDeletingId(id);
        await deleteSupplier(id);
        setDeletingId(null);
        setConfirmDelete(null);
    }

    async function handleBulkDelete() {
        setBulkDeleting(true);
        for (const id of selected) {
            await deleteSupplier(id);
        }
        setBulkDeleting(false);
        setSelected(new Set());
        setConfirmBulkDelete(false);
    }

    const set = (k: keyof Supplier, v: string | boolean) =>
        setForm((f) => f ? { ...f, [k]: v } : f);

    function handleExport() {
        downloadCsv(suppliersToCsv(suppliers), "proveedores.csv");
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = parseSuppliersCsv(ev.target?.result as string);
            setImportResult(result);
        };
        reader.readAsText(file, "utf-8");
        e.target.value = "";
    }

    function handlePasteParse() {
        if (!pasteText.trim()) return;
        const result = parseSuppliersCsv(pasteText);
        setImportResult(result);
        setPasteOpen(false);
        setPasteText("");
    }

    async function handleImport() {
        if (!importResult || !companyId) return;
        setImporting(true);
        for (const s of importResult.suppliers) {
            await saveSupplier({ ...s, companyId });
        }
        setImporting(false);
        setImportResult(null);
        loadSuppliers(companyId);
    }

    // ── derived ─────────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const active   = suppliers.filter((s) => s.active).length;
        const withRif  = suppliers.filter((s) => s.rif?.trim()).length;
        const withMail = suppliers.filter((s) => s.email?.trim()).length;
        return {
            total:    suppliers.length,
            active,
            inactive: suppliers.length - active,
            withRif,
            withMail,
        };
    }, [suppliers]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return suppliers.filter((s) => {
            if (estadoFilter === "activo"   && !s.active) return false;
            if (estadoFilter === "inactivo" &&  s.active) return false;
            if (!q) return true;
            return [s.rif, s.name, s.contact ?? "", s.email ?? "", s.phone ?? ""]
                .join(" ").toLowerCase().includes(q);
        });
    }, [suppliers, search, estadoFilter]);

    const hasFilters = search.trim() !== "" || estadoFilter !== "todos";
    function clearFilters() {
        setSearch("");
        setEstadoFilter("todos");
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Proveedores" subtitle="Directorio · contactos · RIF">
                <BaseButton.Root
                    variant="secondary" size="sm"
                    onClick={handleExport}
                    isDisabled={suppliers.length === 0}
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
                    Nuevo proveedor
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-5">

                {/* KPI strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatTile label="Total proveedores" value={stats.total}    icon={Truck}     tone="primary"  />
                    <StatTile label="Activos"           value={stats.active}   icon={UserCheck} tone="success"  sublabel={stats.total ? `${Math.round((stats.active / stats.total) * 100)}% del directorio` : "Sin proveedores"} />
                    <StatTile label="Con RIF"           value={stats.withRif}  icon={IdCard}    tone="default"  sublabel={stats.total ? `${Math.round((stats.withRif / stats.total) * 100)}% identificados` : undefined} />
                    <StatTile label="Con email"         value={stats.withMail} icon={Mail}      tone="muted"    />
                </div>

                {/* Toolbar */}
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm">
                    <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                        <div className="relative w-full sm:w-72">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                            <input
                                type="text"
                                placeholder="Buscar por RIF, nombre, contacto, email…"
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
                                <span className="text-foreground font-semibold">{filtered.length}</span> / {suppliers.length}
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
{`"rif","nombre","contacto","telefono","email","direccion","notas","activo"
"J-12345678-9","Distribuidora El Sol","Juan Pérez","0414-1234567","info@sol.com","Av. Principal","","true"`}
                        </pre>
                        <textarea
                            className="w-full h-40 px-3 py-2 rounded-lg border border-border-default bg-surface-2 outline-none font-mono text-[12px] text-foreground focus:border-primary-500 hover:border-border-medium transition-colors resize-none"
                            placeholder={`"rif","nombre","contacto","telefono","email","direccion","notas","activo"`}
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
                                {importResult.suppliers.length > 0 && (
                                    <p className="font-sans text-[12px] text-[var(--text-secondary)]">
                                        {importResult.suppliers.length} proveedor(es) listos para importar.
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
                            <BaseButton.Root variant="primary" size="sm" onClick={handleImport} isDisabled={importing || importResult.suppliers.length === 0} loading={importing}>
                                {importing ? "Importando…" : `Importar ${importResult.suppliers.length}`}
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
                                    {form.id ? "Editar proveedor" : "Nuevo proveedor"}
                                </h2>
                                <p className="font-sans text-[12px] text-[var(--text-tertiary)]">
                                    {form.id ? "Actualiza los datos y guarda los cambios." : "Registra un proveedor para usarlo en facturas de compra y retenciones."}
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
                            <FormSection icon={IdCard} title="Identidad" description="RIF y razón social del proveedor.">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <BaseInput.Field
                                        label="RIF"
                                        type="text"
                                        value={form.rif}
                                        onValueChange={(v) => set("rif", v)}
                                        placeholder="J-12345678-9"
                                    />
                                    <BaseInput.Field
                                        label="Nombre"
                                        isRequired
                                        type="text"
                                        value={form.name}
                                        onValueChange={(v) => set("name", v)}
                                        className="md:col-span-2"
                                        placeholder="Razón social del proveedor"
                                    />
                                </div>
                            </FormSection>

                            <FormSection icon={PhoneCall} title="Contacto" description="Persona y canales de comunicación.">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <BaseInput.Field
                                        label="Persona de contacto"
                                        type="text"
                                        value={form.contact}
                                        onValueChange={(v) => set("contact", v)}
                                        placeholder="Nombre y apellido"
                                    />
                                    <BaseInput.Field
                                        label="Teléfono"
                                        type="text"
                                        value={form.phone}
                                        onValueChange={(v) => set("phone", v)}
                                        placeholder="0414-1234567"
                                    />
                                    <BaseInput.Field
                                        label="Email"
                                        type="email"
                                        value={form.email}
                                        onValueChange={(v) => set("email", v)}
                                        placeholder="contacto@empresa.com"
                                    />
                                </div>
                                <div className="mt-4">
                                    <BaseInput.Field
                                        label="Dirección"
                                        type="text"
                                        value={form.address}
                                        onValueChange={(v) => set("address", v)}
                                        placeholder="Av. Principal, Edif., Piso, Ciudad, Estado"
                                    />
                                </div>
                            </FormSection>

                            <FormSection icon={StickyNote} title="Notas" description="Información operativa interna sobre este proveedor.">
                                <textarea
                                    className={`${fieldCls} h-auto py-2 leading-relaxed`}
                                    rows={3}
                                    value={form.notes}
                                    onChange={(e) => set("notes", e.target.value)}
                                    placeholder="Condiciones de pago, catálogo, retenciones aplicables, etc."
                                />
                            </FormSection>

                            <FormSection icon={CheckCircle2} title="Estado" description="Los proveedores inactivos no aparecen en facturas nuevas.">
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
                                {saving ? "Guardando…" : (form.id ? "Guardar cambios" : "Crear proveedor")}
                            </BaseButton.Root>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden shadow-sm">
                    {loadingSuppliers ? (
                        <div className="px-6 py-16 text-center font-sans text-[13px] text-[var(--text-tertiary)]">
                            Cargando proveedores…
                        </div>
                    ) : suppliers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-8 py-16 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Truck size={22} strokeWidth={1.8} />
                            </div>
                            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">Directorio vacío</p>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] max-w-[360px]">
                                Crea el primer proveedor para empezar a registrar facturas de compra y retenciones.
                            </p>
                            <BaseButton.Root variant="primary" size="sm" onClick={openNew} leftIcon={<Plus size={14} strokeWidth={2.5} />}>
                                Nuevo proveedor
                            </BaseButton.Root>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-8 py-16 gap-3 text-center">
                            <div className="h-12 w-12 rounded-2xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Search size={22} strokeWidth={1.8} />
                            </div>
                            <p className="font-mono text-[13px] uppercase tracking-[0.14em] text-foreground">Sin resultados</p>
                            <p className="font-sans text-[13px] text-[var(--text-secondary)] max-w-[360px]">
                                Ningún proveedor coincide con los filtros actuales.
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
                                            { label: "RIF",      align: "text-left"   },
                                            { label: "Nombre",   align: "text-left"   },
                                            { label: "Contacto", align: "text-left"   },
                                            { label: "Teléfono", align: "text-left"   },
                                            { label: "Email",    align: "text-left"   },
                                            { label: "Estado",   align: "text-left"   },
                                            { label: "",         align: "text-right"  },
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
                                    {filtered.map((s) => (
                                        <tr key={s.id} className={[
                                            "border-b border-border-light/60 transition-colors",
                                            selected.has(s.id!) ? "bg-primary-500/5 hover:bg-primary-500/10" : "hover:bg-surface-2/60",
                                        ].join(" ")}>
                                            <td className="px-4 py-3 w-10">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 rounded"
                                                    checked={selected.has(s.id!)}
                                                    onChange={(e) => {
                                                        const next = new Set(selected);
                                                        if (e.target.checked) next.add(s.id!);
                                                        else next.delete(s.id!);
                                                        setSelected(next);
                                                    }}
                                                    aria-label={`Seleccionar ${s.name}`}
                                                />
                                            </td>
                                            <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">{s.rif || "—"}</td>
                                            <td className="px-4 py-3 text-foreground font-medium">
                                                <div className="flex flex-col">
                                                    <span>{s.name}</span>
                                                    {s.address && (
                                                        <span className="font-sans text-[11px] text-[var(--text-tertiary)] truncate max-w-[280px]">
                                                            {s.address}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-[var(--text-secondary)]">{s.contact || "—"}</td>
                                            <td className="px-4 py-3 text-[var(--text-secondary)]">
                                                {s.phone ? (
                                                    <span className="inline-flex items-center gap-1.5">
                                                        <Phone size={11} className="text-[var(--text-tertiary)]" />
                                                        <span className="tabular-nums">{s.phone}</span>
                                                    </span>
                                                ) : "—"}
                                            </td>
                                            <td className="px-4 py-3">
                                                {s.email ? (
                                                    <a
                                                        href={`mailto:${s.email}`}
                                                        className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-primary-500 transition-colors"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Mail size={11} className="text-[var(--text-tertiary)]" />
                                                        <span className="truncate max-w-[200px]">{s.email}</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-[var(--text-tertiary)]">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {s.active ? (
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
                                                    {confirmDelete === s.id ? (
                                                        <div className="flex items-center gap-2 px-2">
                                                            <span className="font-sans text-[12px] text-[var(--text-secondary)] hidden sm:inline">¿Eliminar?</span>
                                                            <button
                                                                onClick={() => handleDelete(s.id!)}
                                                                disabled={deletingId === s.id}
                                                                className="font-mono text-[11px] uppercase tracking-[0.10em] text-text-error hover:text-error transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {deletingId === s.id ? "Eliminando…" : "Confirmar"}
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmDelete(null)}
                                                                disabled={deletingId === s.id}
                                                                className="font-mono text-[11px] uppercase tracking-[0.10em] text-[var(--text-tertiary)] hover:text-foreground transition-colors disabled:opacity-50"
                                                            >
                                                                Cancelar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button
                                                                onClick={() => openEdit(s)}
                                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-primary-500 hover:bg-primary-500/10 transition-colors"
                                                                aria-label={`Editar ${s.name}`}
                                                                title="Editar"
                                                            >
                                                                <Pencil size={14} />
                                                            </button>
                                                            <button
                                                                onClick={() => setConfirmDelete(s.id!)}
                                                                disabled={!!deletingId}
                                                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-tertiary)] hover:text-text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                                                                aria-label={`Eliminar ${s.name}`}
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
