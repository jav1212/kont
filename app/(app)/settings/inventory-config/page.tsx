"use client";

// Inventory configuration page — manage custom fields and visible columns
// for the company's inventory module, driven by sector template + user additions.

import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { CustomFieldDefinition, InventoryConfig } from "@/src/modules/companies/frontend/hooks/use-companies";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { SettingsSection } from "@/src/shared/frontend/components/settings-section";
import { Trash2, Plus, AlertCircle, CheckCircle2 } from "lucide-react";

const fieldCls = [
    "w-full h-9 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[13px] text-foreground",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

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
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

export default function InventoryConfigPage() {
    const { company, companyId, getInventoryConfig, saveInventoryConfig } = useCompany();

    const [config,  setConfig]  = useState<InventoryConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // New field form
    const [newLabel,   setNewLabel]   = useState("");
    const [newType,    setNewType]    = useState<CustomFieldDefinition["type"]>("text");
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

    const sectorLabel = company?.sector ? `Sector: ${company.sector}` : "Sin sector asignado";

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="h-32 rounded-xl border border-border-light bg-surface-1 animate-pulse" />
                <div className="h-44 rounded-xl border border-border-light bg-surface-1 animate-pulse" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <SettingsSection
                title="Campos personalizados"
                subtitle={
                    <>
                        Aparecen en el formulario y la tabla de productos. Los campos heredados de la
                        plantilla del sector pueden eliminarse sin perder datos existentes.
                    </>
                }
                action={
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)] bg-surface-2 border border-border-light rounded-md px-2 py-1">
                        {sectorLabel}
                    </span>
                }
            >
                {config && config.customFields.length > 0 ? (
                    <ul className="space-y-2">
                        {config.customFields.map((f) => (
                            <li
                                key={f.key}
                                className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-border-light bg-surface-2/40"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="font-mono text-[13px] text-foreground truncate">{f.label}</p>
                                    <p className="font-mono text-[11px] text-[var(--text-tertiary)] mt-0.5">
                                        <span className="uppercase tracking-wide">{f.type}</span>
                                        {f.options && <span className="ml-2">[{f.options.join(", ")}]</span>}
                                    </p>
                                </div>
                                <code className="font-mono text-[11px] text-[var(--text-tertiary)] bg-surface-1 border border-border-light/60 px-1.5 py-0.5 rounded">
                                    {f.key}
                                </code>
                                <button
                                    onClick={() => removeField(f.key)}
                                    aria-label={`Eliminar campo ${f.label}`}
                                    className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-text-error hover:bg-error/5 transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="font-sans text-[13px] text-[var(--text-tertiary)]">
                        No hay campos personalizados. Asigna un sector a la empresa o agrega campos manualmente.
                    </p>
                )}
            </SettingsSection>

            <SettingsSection
                title="Agregar campo"
                subtitle="Define una nueva propiedad para tus productos. La clave se genera automáticamente desde la etiqueta."
            >
                <div className={`grid gap-4 ${newType === "select" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
                    <BaseInput.Field
                        label="Etiqueta"
                        type="text"
                        placeholder="Ej: Marca"
                        value={newLabel}
                        onValueChange={setNewLabel}
                    />
                    <div>
                        <label className={labelCls} htmlFor="field-type">Tipo</label>
                        <select
                            id="field-type"
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
                            label="Opciones (separadas por coma)"
                            type="text"
                            placeholder="Opción 1, Opción 2"
                            value={newOptions}
                            onValueChange={setNewOptions}
                        />
                    )}
                </div>
                <div className="mt-5">
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
            </SettingsSection>

            {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg border badge-error">
                    <AlertCircle size={14} />
                    <p className="font-sans text-[12px] text-text-error">{error}</p>
                </div>
            )}
            {success && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg border badge-success">
                    <CheckCircle2 size={14} />
                    <p className="font-sans text-[12px] text-text-success">Configuración guardada correctamente.</p>
                </div>
            )}

            <div className="flex justify-end">
                <BaseButton.Root
                    variant="primary"
                    size="md"
                    onClick={handleSave}
                    isDisabled={saving}
                    loading={saving}
                >
                    {saving ? "Guardando…" : "Guardar configuración"}
                </BaseButton.Root>
            </div>
        </div>
    );
}
