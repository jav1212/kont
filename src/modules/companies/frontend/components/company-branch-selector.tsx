"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { notify } from "@/src/shared/frontend/notify";

interface BranchOption { readonly id: string; readonly code: string; readonly name: string; }
interface BranchSelection { readonly branchId: string | null; readonly version: number; }

/** Presents the user's server-persisted work branch and saves changes with optimistic concurrency.
 * @param props - Company scope and whether the current actor may select a branch.
 * @returns A company settings section for branch attribution.
 * @throws No expected errors; API failures are reported through the Web notification system.
 */
export function CompanyBranchSelector({ companyId, canRead, canSelect, canCreate }: { readonly companyId: string | null; readonly canRead: boolean; readonly canSelect: boolean; readonly canCreate: boolean }): React.JSX.Element {
  const [branches, setBranches] = useState<readonly BranchOption[]>([]);
  const [selection, setSelection] = useState<BranchSelection>({ branchId: null, version: 0 });
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!companyId || !canRead) {
      setBranches([]);
      setSelection({ branchId: null, version: 0 });
      setValue("");
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch(`/api/companies/branches?companyId=${encodeURIComponent(companyId)}`, { signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible consultar las sucursales.");
      if (signal?.aborted) return;
      setBranches(payload.data.branches);
      setSelection(payload.data.selection);
      setValue(payload.data.selection.branchId ?? "");
    } catch (cause) {
      if (!signal?.aborted) notify.error(cause instanceof Error ? cause.message : "No fue posible consultar las sucursales.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [companyId, canRead]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  async function save(): Promise<void> {
    if (!companyId || saving || !canSelect) return;
    setSaving(true);
    try {
      const response = await apiFetch("/api/companies/branches", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, branchId: value || null, expectedVersion: selection.version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible guardar la sucursal.");
      setSelection(payload.data);
      setValue(payload.data.branchId ?? "");
      notify.success(payload.data.branchId ? "Sucursal de trabajo actualizada." : "Selección de sucursal retirada.");
    } catch (cause) {
      notify.error(cause instanceof Error ? cause.message : "No fue posible guardar la sucursal.");
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function createBranch(): Promise<void> {
    if (!companyId || creating || !canCreate || !newCode.trim() || !newName.trim()) return;
    setCreating(true);
    try {
      const response = await apiFetch("/api/companies/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, code: newCode.trim(), name: newName.trim(), idempotencyKey: crypto.randomUUID() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No fue posible crear la sucursal.");
      setNewCode("");
      setNewName("");
      notify.success("Sucursal registrada.");
      await reload();
    } catch (cause) {
      notify.error(cause instanceof Error ? cause.message : "No fue posible crear la sucursal.");
    } finally {
      setCreating(false);
    }
  }

  const dirty = value !== (selection.branchId ?? "");
  return <SettingsSection title="Sucursal de trabajo" subtitle="Las nuevas ventas confirmadas se atribuyen a la sucursal seleccionada. La selección es personal y se conserva por empresa." flush>
    {canRead && <div className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-end">
      <label className="block flex-1">
        <span className="mb-1 block font-mono text-[11px] uppercase text-[var(--text-tertiary)]">Sucursal activa</span>
        <select value={value} onChange={(event) => setValue(event.target.value)} disabled={!companyId || loading || saving || !canSelect} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-[13px] text-foreground disabled:opacity-50">
          <option value="">Sin sucursal asignada</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.code} · {branch.name}</option>)}
        </select>
        {!branches.length && !loading && <span className="mt-1 block text-xs text-[var(--text-tertiary)]">Esta empresa todavía no tiene sucursales registradas.</span>}
      </label>
      <button type="button" onClick={() => void save()} disabled={!dirty || saving || loading || !canSelect} className="rounded-lg bg-primary-600 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-white disabled:opacity-50">{saving ? "Guardando…" : "Guardar selección"}</button>
    </div>}
      {canCreate && <div className="grid gap-3 border-t border-border-light px-6 py-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <label className="block"><span className="mb-1 block font-mono text-[11px] uppercase text-[var(--text-tertiary)]">Código</span><input value={newCode} onChange={(event) => setNewCode(event.target.value.toUpperCase())} maxLength={32} placeholder="CENTRAL" disabled={creating} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-mono text-[13px] disabled:opacity-50" /></label>
        <label className="block"><span className="mb-1 block font-mono text-[11px] uppercase text-[var(--text-tertiary)]">Nombre</span><input value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={120} placeholder="Sucursal principal" disabled={creating} className="w-full rounded-lg border border-border-light bg-surface-1 px-3 py-2 font-sans text-[13px] disabled:opacity-50" /></label>
        <button type="button" onClick={() => void createBranch()} disabled={creating || !newCode.trim() || !newName.trim()} className="rounded-lg border border-border-light px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-foreground disabled:opacity-50">{creating ? "Creando…" : "Crear sucursal"}</button>
      </div>}
  </SettingsSection>;
}
