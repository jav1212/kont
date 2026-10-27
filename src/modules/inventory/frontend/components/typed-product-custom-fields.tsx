"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductCustomFieldDefinition, ProductCustomFieldValues } from "@kontave/products/domain";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { notify } from "@/src/shared/frontend/notify";
import { apiFetch } from "@/src/shared/frontend/utils/api-fetch";
import { ApiRequestFailure } from "@/src/shared/frontend/feedback/api-request-failure";

type Catalog = { definitions: readonly ProductCustomFieldDefinition[]; version: number; updatedAt: string | null };
type Values = { values: ProductCustomFieldValues; version: number };
type FieldType = ProductCustomFieldDefinition["type"];

/**
 * Manages a versioned typed catalog without changing legacy inventory_config fields.
 * @param props - Active company, existing legacy stable keys, and catalog-management capability.
 * @returns The typed catalog editor.
 */
export function TypedProductCustomFieldsSettings({ companyId, legacyIds, canManage }: {
  readonly companyId: string;
  readonly legacyIds: readonly string[];
  readonly canManage: boolean;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [options, setOptions] = useState("");
  const [saving, setSaving] = useState(false);
  const legacy = useMemo(() => new Set(legacyIds), [legacyIds]);
  const load = useCallback(async () => {
    const response = await apiFetch(`/api/inventory/product-custom-fields?companyId=${encodeURIComponent(companyId)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new ApiRequestFailure(response, payload?.error ?? "No fue posible cargar el catálogo.", payload);
    setCatalog(payload.data as Catalog);
  }, [companyId]);
  useEffect(() => { void load().catch((error: unknown) => notify.failure(error, "No fue posible cargar el catálogo.")); }, [load]);
  const add = () => {
    const normalized = id.trim();
    if (!label.trim() || !normalized) return notify.error("Indica una etiqueta y una clave estable.");
    if (legacy.has(normalized)) return notify.error("Esta clave ya existe en la configuración heredada. Migra ese campo antes de reutilizarla.");
    if (catalog?.definitions.some((field) => field.id === normalized)) return notify.error("Ya existe un campo con esa clave.");
    const field: ProductCustomFieldDefinition = type === "text"
      ? { id: normalized, label: label.trim(), type, required: false, maxLength: 255 }
      : type === "number" ? { id: normalized, label: label.trim(), type, required: false, minimum: null, maximum: null }
      : type === "select" ? { id: normalized, label: label.trim(), type, required: false, options: options.split(",").map((value) => value.trim()).filter(Boolean) }
      : { id: normalized, label: label.trim(), type, required: false };
    setCatalog((current) => current ? { ...current, definitions: [...current.definitions, field] } : current);
    setLabel(""); setId(""); setOptions("");
  };
  const save = async () => {
    if (!catalog || !canManage) return;
    setSaving(true);
    try {
      const response = await apiFetch("/api/inventory/product-custom-fields", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, expectedVersion: catalog.version, definitions: catalog.definitions }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new ApiRequestFailure(response, payload?.error ?? "No fue posible guardar el catálogo.", payload);
      setCatalog(payload.data as Catalog); notify.success("Catálogo tipado guardado.");
    } catch (error) { notify.failure(error, "No fue posible guardar el catálogo."); await load(); }
    finally { setSaving(false); }
  };
  if (!catalog) return <p className="font-sans text-[13px] text-[var(--text-tertiary)]">Cargando catálogo tipado…</p>;
  return <div className="space-y-4">
    <p className="font-sans text-[13px] text-[var(--text-secondary)]">Campos nuevos con tipos, validación y control de cambios. No reemplazan los campos heredados ni sus valores.</p>
    {catalog.definitions.length > 0 && <ul className="space-y-2">{catalog.definitions.map((field) => <li key={field.id} className="flex items-center gap-3 rounded-lg border border-border-light bg-surface-2/40 px-3 py-2"><span className="flex-1 font-mono text-[13px]">{field.label} <span className="text-[var(--text-tertiary)]">({field.type})</span></span><code className="text-[11px] text-[var(--text-tertiary)]">{field.id}</code><button aria-label={`Eliminar ${field.label}`} disabled={!canManage} onClick={() => setCatalog((current) => current ? { ...current, definitions: current.definitions.filter((item) => item.id !== field.id) } : current)} className="text-[12px] text-text-error">Eliminar</button></li>)}</ul>}
    <div className="grid gap-3 md:grid-cols-4"><BaseInput.Field label="Etiqueta" value={label} onValueChange={setLabel} isDisabled={!canManage} /><BaseInput.Field label="Clave" value={id} onValueChange={setId} placeholder="ej. marca" isDisabled={!canManage} /><label className="font-mono text-[11px] uppercase tracking-[.12em] text-[var(--text-tertiary)]">Tipo<select className="mt-1 block h-10 w-full rounded-lg border border-border-light bg-surface-1 px-2 text-[13px]" value={type} onChange={(event) => setType(event.target.value as FieldType)} disabled={!canManage}>{["text", "number", "boolean", "date", "select"].map((value) => <option key={value}>{value}</option>)}</select></label>{type === "select" && <BaseInput.Field label="Opciones" value={options} onValueChange={setOptions} placeholder="A, B" isDisabled={!canManage} />}</div>
    <div className="flex gap-3"><BaseButton.Root variant="secondary" size="sm" onClick={add} isDisabled={!canManage}>Agregar al catálogo</BaseButton.Root><BaseButton.Root variant="primary" size="sm" onClick={save} loading={saving} isDisabled={!canManage}>Guardar catálogo tipado</BaseButton.Root></div>
  </div>;
}

/**
 * Edits values from the typed catalog for one already persisted product.
 * @param props - Company and persisted product identifiers that scope API calls.
 * @returns The value editor, or nothing when the company has no typed definitions.
 */
export function TypedProductCustomFieldValues({ companyId, productId, fieldLabels = {}, hiddenFieldIds = [] }: { readonly companyId: string; readonly productId: string; readonly fieldLabels?: Readonly<Record<string, string>>; readonly hiddenFieldIds?: readonly string[] }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [snapshot, setSnapshot] = useState<Values | null>(null);
  const [values, setValues] = useState<Record<string, string | number | boolean | null>>({});
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const [catalogResponse, valuesResponse] = await Promise.all([apiFetch(`/api/inventory/product-custom-fields?companyId=${encodeURIComponent(companyId)}`), apiFetch(`/api/inventory/products/${encodeURIComponent(productId)}/custom-fields?companyId=${encodeURIComponent(companyId)}`)]);
    const [catalogPayload, valuesPayload] = await Promise.all([catalogResponse.json(), valuesResponse.json()]);
    if (!catalogResponse.ok || !valuesResponse.ok) throw new Error(catalogPayload.error ?? valuesPayload.error ?? "No fue posible cargar los campos.");
    setCatalog(catalogPayload.data as Catalog); setSnapshot(valuesPayload.data as Values); setValues(valuesPayload.data.values ?? {});
  }, [companyId, productId]);
  useEffect(() => { void load().catch((error: unknown) => notify.failure(error, "No fue posible cargar los campos.")); }, [load]);
  const save = async () => { if (!snapshot) return; setSaving(true); try { const response = await apiFetch(`/api/inventory/products/${encodeURIComponent(productId)}/custom-fields`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, expectedVersion: snapshot.version, values }) }); const payload = await response.json(); if (!response.ok) throw new ApiRequestFailure(response, payload.error ?? "No fue posible guardar los campos.", payload); setSnapshot(payload.data as Values); setValues(payload.data.values); notify.success("Campos tipados guardados."); } catch (error) { notify.failure(error, "No fue posible guardar los campos."); await load(); } finally { setSaving(false); } };
  if (!catalog || !snapshot || catalog.definitions.length === 0) return null;
  const hidden = new Set(hiddenFieldIds);
  const visibleDefinitions = catalog.definitions.filter((field) => !hidden.has(`typed-custom-${field.id}`));
  if (visibleDefinitions.length === 0) return null;
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3">{visibleDefinitions.map((field) => <TypedValueInput key={field.id} field={field} label={fieldLabels[`typed-custom-${field.id}`] ?? field.label} value={values[field.id] ?? null} onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))} />)}</div><BaseButton.Root variant="secondary" size="sm" onClick={save} loading={saving}>Guardar campos tipados</BaseButton.Root></div>;
}

function TypedValueInput({ field, label, value, onChange }: { readonly field: ProductCustomFieldDefinition; readonly label: string; readonly value: string | number | boolean | null; readonly onChange: (value: string | number | boolean | null) => void }) {
  if (field.type === "boolean") return <label className="flex items-center gap-2 pt-6 text-[13px]"><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
  if (field.type === "select") return <label className="font-mono text-[11px] uppercase tracking-[.12em] text-[var(--text-tertiary)]">{label}<select className="mt-1 block h-10 w-full rounded-lg border border-border-light bg-surface-1 px-2 text-[13px]" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)}><option value="">—</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>;
  return <BaseInput.Field label={label} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={value == null ? "" : String(value)} onValueChange={(next) => onChange(next === "" ? null : field.type === "number" ? Number(next) : next)} isRequired={field.required} />;
}
