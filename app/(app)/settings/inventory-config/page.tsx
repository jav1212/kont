"use client";

// Inventory configuration page — manage custom fields and visible columns
// for the company's inventory module, driven by sector template + user additions.

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { CustomFieldDefinition, InventoryConfig } from "@/src/modules/companies/frontend/hooks/use-companies";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { Trash2, Plus } from "lucide-react";

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1 block";

const FIELD_TYPES: { value: CustomFieldDefinition["type"]; label: string }[] = [
    { value: "text",   label: "Texto" },
    { value: "number", label: "Número" },
    { value: "date",   label: "Fecha" },
    { value: "select", label: "Lista" },
];

function generateKey(label: string): string {
    return label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export default function InventoryConfigPage() {
    const { company, companyId, getInventoryConfig, saveInventoryConfig } = useCompany();

    const [config, setConfig] = useState<InventoryConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // New field form
    const [newLabel, setNewLabel] = useState("");
    const [newType, setNewType] = useState<CustomFieldDefinition["type"]>("text");
    const [newOptions, setNewOptions] = useState("");

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        (async () => {
            const result = await getInventoryConfig(companyId);
            if (!cancelled) {
                setConfig(result ?? { customFields: [] });
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [companyId, getInventoryConfig]);

    const handleSave = useCallback(async () => {
        if (!companyId || !config) return;
        setSaving(true);
        setError(null);
        const err = await saveInventoryConfig(companyId, config);
        setSaving(false);
        if (err) { setError(err); } else { setSuccess(true); setTimeout(() => setSuccess(false), 2000); }
    }, [companyId, config, saveInventoryConfig]);

    const addField = useCallback(() => {
        if (!newLabel.trim() || !config) return;
        const key = generateKey(newLabel.trim());
        if (config.customFields.some(f => f.key === key)) {
            setError(`Ya existe un campo con la clave "${key}"`);
            return;
        }
        const field: CustomFieldDefinition = {
            key,
            label: newLabel.trim(),
            type: newType,
            ...(newType === "select" && newOptions.trim()
                ? { options: newOptions.split(",").map(o => o.trim()).filter(Boolean) }
                : {}),
        };
        setConfig({ ...config, customFields: [...config.customFields, field] });
        setNewLabel("");
        setNewType("text");
        setNewOptions("");
        setError(null);
    }, [newLabel, newType, newOptions, config]);

    const removeField = useCallback((key: string) => {
        if (!config) return;
        setConfig({ ...config, customFields: config.customFields.filter(f => f.key !== key) });
    }, [config]);

    const sectorLabel = company?.sector
        ? `Sector: ${company.sector}`
        : "Sin sector asignado";

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Configuración de Inventario"
                subtitle={sectorLabel}
            />

            <div className="px-8 py-6 space-y-6 max-w-3xl">
                {loading ? (
                    <p className="text-[13px] text-[var(--text-tertiary)]">Cargando...</p>
                ) : (
                    <>
                        {/* Current custom fields */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-4">
                            <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
                                Campos personalizados
                            </h2>
                            <p className="text-[12px] text-[var(--text-tertiary)]">
                                Estos campos aparecen en el formulario y tabla de productos. Los campos de la plantilla del sector pueden eliminarse sin perder datos existentes.
                            </p>

                            {config && config.customFields.length > 0 ? (
                                <div className="space-y-2">
                                    {config.customFields.map((f) => (
                                        <div
                                            key={f.key}
                                            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border-light bg-surface-2/30"
                                        >
                                            <div className="flex-1">
                                                <span className="text-[13px] font-medium text-foreground">{f.label}</span>
                                                <span className="ml-2 text-[11px] text-[var(--text-tertiary)]">({f.type})</span>
                                                {f.options && (
                                                    <span className="ml-2 text-[11px] text-[var(--text-tertiary)]">
                                                        [{f.options.join(", ")}]
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[11px] text-[var(--text-tertiary)] font-mono">{f.key}</span>
                                            <button
                                                onClick={() => removeField(f.key)}
                                                className="p-1 rounded hover:bg-red-50 text-[var(--text-tertiary)] hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-[13px] text-[var(--text-tertiary)]">
                                    No hay campos personalizados. Asigna un sector a la empresa o agrega campos manualmente.
                                </p>
                            )}
                        </div>

                        {/* Add new field */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6 space-y-4">
                            <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
                                Agregar campo
                            </h2>
                            <div className="grid grid-cols-3 gap-4">
                                <BaseInput.Field
                                    label="Etiqueta"
                                    type="text"
                                    placeholder="Ej: Marca"
                                    value={newLabel}
                                    onValueChange={setNewLabel}
                                />
                                <div>
                                    <label className={labelCls}>Tipo</label>
                                    <select
                                        className={fieldCls}
                                        value={newType}
                                        onChange={(e) => setNewType(e.target.value as CustomFieldDefinition["type"])}
                                    >
                                        {FIELD_TYPES.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                                {newType === "select" && (
                                    <BaseInput.Field
                                        label="Opciones (coma)"
                                        type="text"
                                        placeholder="Opción 1, Opción 2"
                                        value={newOptions}
                                        onValueChange={setNewOptions}
                                    />
                                )}
                            </div>
                            <BaseButton.Root
                                variant="secondary"
                                size="sm"
                                onClick={addField}
                                isDisabled={!newLabel.trim()}
                                leftIcon={<Plus size={14} />}
                            >
                                Agregar campo
                            </BaseButton.Root>
                        </div>

                        {/* Save */}
                        {error && (
                            <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                                {error}
                            </div>
                        )}
                        {success && (
                            <div className="px-4 py-3 rounded-lg border border-green-500/20 bg-green-500/[0.05] text-green-600 text-[13px]">
                                Configuración guardada correctamente.
                            </div>
                        )}
                        <BaseButton.Root
                            variant="primary"
                            size="sm"
                            onClick={handleSave}
                            isDisabled={saving}
                            loading={saving}
                        >
                            {saving ? "Guardando..." : "Guardar configuración"}
                        </BaseButton.Root>
                    </>
                )}
            </div>
        </div>
    );
}
