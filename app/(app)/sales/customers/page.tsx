"use client";

// Page: Clientes — CRUD del master de clientes (módulo Sales).

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Search, X, AlertTriangle, Users, Columns3 } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useSales, type Customer } from "@/src/modules/sales/frontend/hooks/use-sales";
import { notify } from "@/src/shared/frontend/notify";

function emptyCustomer(companyId: string): Customer {
    return {
        companyId, rif: "", name: "", contact: "",
        phone: "", email: "", address: "", notes: "", active: true,
    };
}

export default function CustomersPage() {
    const { companyId } = useCompany();
    const {
        customers, loadingCustomers,
        loadCustomers, saveCustomer, deleteCustomer,
    } = useSales();

    const [search, setSearch] = useState("");
    const [editing, setEditing] = useState<Customer | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<Customer | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [viewPreferences, setViewPreferences] = useState<{ hiddenColumnIds: readonly string[]; version: number } | null>(null);
    const [savingVisibility, setSavingVisibility] = useState(false);

    useEffect(() => {
        if (companyId) loadCustomers(companyId);
    }, [companyId, loadCustomers]);

    useEffect(() => {
        let current = true;
        void fetch("/api/preferences/view-visibility?viewId=sales.customers", { cache: "no-store" }).then(async (response) => {
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error ?? "No fue posible cargar las preferencias de columnas.");
            if (current) setViewPreferences({ hiddenColumnIds: payload.data.hiddenColumnIds ?? [], version: payload.data.version });
        }).catch((error: unknown) => { if (current) notify.error(error instanceof Error ? error.message : "No fue posible cargar las preferencias de columnas."); });
        return () => { current = false; };
    }, []);

    async function toggleColumn(columnId: string) {
        if (!viewPreferences || savingVisibility) return;
        const hiddenColumnIds = viewPreferences.hiddenColumnIds.includes(columnId)
            ? viewPreferences.hiddenColumnIds.filter((id) => id !== columnId)
            : [...viewPreferences.hiddenColumnIds, columnId];
        setSavingVisibility(true);
        try {
            const response = await fetch("/api/preferences/view-visibility", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ viewId: "sales.customers", expectedVersion: viewPreferences.version, hiddenColumnIds }) });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error ?? "No fue posible guardar las columnas visibles.");
            setViewPreferences({ hiddenColumnIds: payload.data.hiddenColumnIds ?? [], version: payload.data.version });
        } catch (error) { notify.error(error instanceof Error ? error.message : "No fue posible guardar las columnas visibles."); }
        finally { setSavingVisibility(false); }
    }

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return customers;
        return customers.filter((c) =>
            c.name.toLowerCase().includes(q) || c.rif.toLowerCase().includes(q),
        );
    }, [customers, search]);

    function startCreate() {
        if (!companyId) return;
        setEditing(emptyCustomer(companyId));
    }

    async function handleSave() {
        if (!editing) return;
        if (!editing.rif.trim()) return;
        if (!editing.name.trim()) return;
        setSaving(true);
        const saved = await saveCustomer(editing);
        setSaving(false);
        if (saved) setEditing(null);
    }

    async function handleDelete() {
        if (!confirmDelete?.id) return;
        setDeleting(true);
        await deleteCustomer(confirmDelete.id);
        setDeleting(false);
        setConfirmDelete(null);
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Clientes" subtitle="Master del módulo de Ventas">
                <BaseButton.Root variant="primary" size="sm" leftIcon={<Plus size={14} strokeWidth={2} />} onClick={startCreate}>
                    Nuevo cliente
                </BaseButton.Root>
            </PageHeader>

            {/* Edit modal */}
            {editing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-surface-1 border border-border-medium rounded-xl shadow-xl w-full max-w-lg">
                        <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                                {editing.id ? "Editar cliente" : "Nuevo cliente"}
                            </h2>
                            <button onClick={() => setEditing(null)} className="w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-foreground hover:bg-surface-2">
                                <X size={14} strokeWidth={2} />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field label="RIF *" value={editing.rif} onValueChange={(v) => setEditing({ ...editing, rif: v })} placeholder="J-12345678-9" />
                                <BaseInput.Field label="Razón Social *" value={editing.name} onValueChange={(v) => setEditing({ ...editing, name: v })} />
                            </div>
                            <BaseInput.Field label="Dirección" value={editing.address} onValueChange={(v) => setEditing({ ...editing, address: v })} />
                            <div className="grid grid-cols-2 gap-3">
                                <BaseInput.Field label="Contacto" value={editing.contact} onValueChange={(v) => setEditing({ ...editing, contact: v })} />
                                <BaseInput.Field label="Teléfono" value={editing.phone} onValueChange={(v) => setEditing({ ...editing, phone: v })} />
                            </div>
                            <BaseInput.Field label="Email" type="email" value={editing.email} onValueChange={(v) => setEditing({ ...editing, email: v })} />
                            <BaseInput.Field label="Notas" value={editing.notes} onValueChange={(v) => setEditing({ ...editing, notes: v })} />
                        </div>
                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <BaseButton.Root variant="secondary" size="md" onClick={() => setEditing(null)} disabled={saving}>Cancelar</BaseButton.Root>
                            <BaseButton.Root variant="primary" size="md" onClick={handleSave} disabled={saving || !editing.rif || !editing.name}>
                                {saving ? "Guardando…" : "Guardar"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete confirm */}
            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-surface-1 border border-yellow-500/20 rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="px-6 py-4 border-b border-yellow-500/20 bg-yellow-500/[0.06] rounded-t-xl flex items-center gap-2">
                            <AlertTriangle size={16} strokeWidth={2} className="text-yellow-600" />
                            <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-yellow-600">Eliminar cliente</h2>
                        </div>
                        <div className="px-6 py-5 font-sans text-[14px] text-foreground leading-relaxed">
                            Si tiene facturas asociadas se inactiva (soft delete). Si no, se elimina definitivamente.
                        </div>
                        <div className="px-6 py-4 border-t border-border-light flex items-center justify-end gap-3">
                            <BaseButton.Root variant="secondary" size="md" onClick={() => setConfirmDelete(null)} disabled={deleting}>Cancelar</BaseButton.Root>
                            <BaseButton.Root variant="danger" size="md" onClick={handleDelete} disabled={deleting}>
                                {deleting ? "Eliminando…" : "Eliminar"}
                            </BaseButton.Root>
                        </div>
                    </div>
                </div>
            )}

            <div className="px-8 py-6 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                <div className="relative max-w-md flex-1">
                    <Search size={14} strokeWidth={2} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o RIF…"
                        className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-light bg-surface-1 outline-none font-mono text-[13px] text-foreground focus:border-primary-500/60 transition-colors" />
                </div>
                <details className="relative">
                    <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border border-border-light bg-surface-1 px-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--text-secondary)] hover:bg-surface-2"><Columns3 size={14} /> Columnas</summary>
                    <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-border-light bg-surface-1 p-3 shadow-xl">
                        <p className="mb-2 font-sans text-[11px] text-[var(--text-tertiary)]">RIF, razón social y acciones permanecen visibles.</p>
                        {[{ id: "contact", label: "Contacto" }, { id: "phone", label: "Teléfono" }, { id: "email", label: "Email" }, { id: "status", label: "Estado" }].map((column) => (
                            <label key={column.id} className="mb-2 flex cursor-pointer items-center gap-2 font-sans text-[12px] text-foreground">
                                <input type="checkbox" checked={!viewPreferences?.hiddenColumnIds.includes(column.id)} disabled={!viewPreferences || savingVisibility} onChange={() => void toggleColumn(column.id)} />
                                {column.label}
                            </label>
                        ))}
                    </div>
                </details>
                </div>

                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    {loadingCustomers ? (
                        <div className="px-5 py-12 text-center font-sans text-[13px] text-[var(--text-tertiary)]">Cargando clientes…</div>
                    ) : filtered.length === 0 ? (
                        <div className="px-5 py-16 flex flex-col items-center justify-center gap-3 text-center">
                            <div className="w-12 h-12 rounded-xl bg-surface-2 border border-border-light flex items-center justify-center text-[var(--text-tertiary)]">
                                <Users size={20} strokeWidth={1.8} />
                            </div>
                            <p className="text-[12px] uppercase tracking-[0.12em] text-foreground">Sin clientes</p>
                            <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                                Registra el master de clientes para emitir facturas.
                            </p>
                            <BaseButton.Root variant="primary" size="sm" leftIcon={<Plus size={14} strokeWidth={2} />} onClick={startCreate}>
                                Nuevo cliente
                            </BaseButton.Root>
                        </div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead>
                                <tr className="border-b border-border-light bg-surface-2/50">
                                    {["RIF", "Razón Social", "Contacto", "Teléfono", "Email", "Estado", "", ""].map((h, i) => (
                                        <th key={i} hidden={i >= 2 && i <= 5 && viewPreferences?.hiddenColumnIds.includes(["contact", "phone", "email", "status"][i - 2])} className="px-4 py-2.5 text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-normal text-left whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((c) => (
                                    <tr key={c.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors group">
                                        <td className="px-4 py-2.5 tabular-nums text-foreground whitespace-nowrap">{c.rif}</td>
                                        <td className="px-4 py-2.5 text-foreground font-medium">{c.name}</td>
                                        <td hidden={viewPreferences?.hiddenColumnIds.includes("contact")} className="px-4 py-2.5 text-[var(--text-secondary)]">{c.contact || "—"}</td>
                                        <td hidden={viewPreferences?.hiddenColumnIds.includes("phone")} className="px-4 py-2.5 text-[var(--text-secondary)] tabular-nums">{c.phone || "—"}</td>
                                        <td hidden={viewPreferences?.hiddenColumnIds.includes("email")} className="px-4 py-2.5 text-[var(--text-secondary)]">{c.email || "—"}</td>
                                        <td hidden={viewPreferences?.hiddenColumnIds.includes("status")} className="px-4 py-2.5">
                                            <span className={`inline-flex px-1.5 py-0.5 rounded border text-[11px] uppercase tracking-[0.08em] font-medium ${c.active ? 'badge-success' : 'badge-warning'}`}>
                                                {c.active ? "Activo" : "Inactivo"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <button type="button" onClick={() => setEditing(c)}
                                                className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.10em] text-primary-500 hover:text-primary-600 transition-opacity">
                                                <Pencil size={12} strokeWidth={2} />
                                                Editar
                                            </button>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <button type="button" onClick={() => setConfirmDelete(c)}
                                                className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded text-[var(--text-tertiary)] hover:text-red-500 hover:bg-red-500/10 transition-all">
                                                <Trash2 size={14} strokeWidth={2} />
                                            </button>
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
