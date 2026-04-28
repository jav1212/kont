"use client";

// OperationForm — single, reusable orchestrator for the three manual movement
// operations (adjustment, return, self-consumption). The behavior of every
// branch lives in `OperationConfig` (see operation-config.ts); this component
// just wires the config + the `useOperationForm` hook to the visual chrome.

import { ChevronLeft, Info, RefreshCw } from "lucide-react";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BcvRateInput } from "@/src/modules/inventory/frontend/components/bcv-rate-input";

import { getOperationConfig } from "./operation-config";
import { useOperationForm } from "./use-operation-form";
import { OperationContextFields } from "./operation-context-fields";
import { OperationItemsGrid } from "./operation-items-grid";
import { OperationSuccessScreen } from "./operation-success-screen";
import type { OperationKind } from "./operation-types";

const labelCls =
    "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const groupLabelCls =
    "font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-3 flex items-center gap-2";

interface Props {
    op: OperationKind;
    /** When provided, renders a "Cambiar tipo" button in the header that lets
     *  the user return to the kind selector. Used by `OperationsWorkspace`. */
    onChangeKind?: () => void;
}

export function OperationForm({ op, onChangeKind }: Props) {
    const router = useRouter();
    const config = getOperationConfig(op);
    const form = useOperationForm(config);

    if (form.saved) {
        return (
            <OperationSuccessScreen
                pageTitle={config.labels.pageTitle}
                successTitle={config.labels.successTitle}
                successMessage={config.labels.successMessage}
                primaryListLabel={config.labels.primaryListLabel}
                primaryListPath={config.labels.primaryListPath}
                period={form.savedPeriod ?? form.date.slice(0, 7)}
            />
        );
    }

    const directionFooterNote = form.resolvedDirection.footerNote;

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title={config.labels.pageTitle} subtitle={config.labels.pageSubtitle}>
                {onChangeKind && (
                    <BaseButton.Root
                        variant="ghost"
                        size="sm"
                        onClick={onChangeKind}
                        leftIcon={<RefreshCw size={14} strokeWidth={2} />}
                    >
                        Cambiar tipo
                    </BaseButton.Root>
                )}
                <BaseButton.Root
                    variant="secondary"
                    size="sm"
                    onClick={() => router.back()}
                    leftIcon={<ChevronLeft size={14} strokeWidth={2} />}
                >
                    Volver
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-6 space-y-5 max-w-5xl">
                {/* Datos de la operación */}
                <div className="rounded-xl border border-border-light bg-surface-1 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-border-light flex items-center justify-between">
                        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em] text-foreground">
                            {config.labels.sectionTitle}
                        </h2>
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary-500">
                            Paso 2 de 2
                        </span>
                    </div>

                    <div className="p-6 space-y-6">
                        {/* Dirección — toggle o banner fijo */}
                        <div>
                            <div className={groupLabelCls}>
                                <span className="w-1 h-1 rounded-full bg-primary-500" aria-hidden />
                                Dirección del movimiento
                            </div>

                            {config.directionOptions ? (
                                <>
                                    <label className={labelCls}>{config.labels.directionToggleLabel}</label>
                                    <div className="flex rounded-lg border border-border-default overflow-hidden h-10 text-[12px] w-full max-w-md shadow-sm">
                                        {config.directionOptions.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                className={[
                                                    "flex-1 px-4 font-mono uppercase tracking-[0.10em]",
                                                    "transition-colors duration-150",
                                                    form.selectedDirection?.value === opt.value
                                                        ? "bg-primary-500 text-white"
                                                        : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2 hover:text-foreground",
                                                ].join(" ")}
                                                onClick={() => form.setSelectedDirection(opt)}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="font-sans text-[12px] text-[var(--text-secondary)] mt-2 leading-relaxed">
                                        {form.resolvedDirection.description}
                                    </p>
                                </>
                            ) : (
                                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06]">
                                    <Info size={14} strokeWidth={2} className="text-amber-500 mt-0.5 flex-shrink-0" />
                                    <p className="font-sans text-[12px] text-amber-700 dark:text-amber-400 leading-relaxed">
                                        {form.resolvedDirection.description}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Configuración: fecha + tasa BCV + IVA */}
                        <div className="pt-2 border-t border-border-light/60">
                            <div className={groupLabelCls + " mt-4"}>
                                <span className="w-1 h-1 rounded-full bg-primary-500" aria-hidden />
                                Configuración fiscal
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <BaseInput.Field
                                        label="Fecha *"
                                        type="date"
                                        value={form.date}
                                        onValueChange={form.setDate}
                                    />
                                </div>

                                <BcvRateInput
                                    rate={form.bcv.rate}
                                    onRateChange={(v) => { form.bcv.setRateTyped(v); form.bcv.setBcvDate(null); }}
                                    decimals={form.bcv.decimals}
                                    onDecimalsChange={form.bcv.applyDecimals}
                                    loading={form.bcv.loading}
                                    bcvDate={form.bcv.bcvDate}
                                    error={form.bcv.error}
                                />

                                <div className="col-span-2">
                                    <label className={labelCls}>Tratamiento de IVA</label>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex rounded-lg border border-border-default overflow-hidden h-10 text-[12px] w-72 shadow-sm">
                                            <button
                                                type="button"
                                                className={[
                                                    "flex-1 px-4 font-mono uppercase tracking-[0.10em]",
                                                    "transition-colors duration-150",
                                                    form.ivaMode === "agregado"
                                                        ? "bg-primary-500 text-white"
                                                        : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2 hover:text-foreground",
                                                ].join(" ")}
                                                onClick={() => form.setIvaMode("agregado")}
                                            >
                                                IVA Agregado
                                            </button>
                                            <button
                                                type="button"
                                                className={[
                                                    "flex-1 px-4 font-mono uppercase tracking-[0.10em]",
                                                    "transition-colors duration-150",
                                                    form.ivaMode === "incluido"
                                                        ? "bg-primary-500 text-white"
                                                        : "bg-surface-1 text-[var(--text-secondary)] hover:bg-surface-2 hover:text-foreground",
                                                ].join(" ")}
                                                onClick={() => form.setIvaMode("incluido")}
                                            >
                                                IVA Incluido
                                            </button>
                                        </div>
                                        <p className="font-sans text-[12px] text-[var(--text-secondary)] leading-snug flex-1 min-w-[260px]">
                                            {form.ivaMode === "agregado"
                                                ? "El costo ingresado es la base — el IVA se calcula y suma encima."
                                                : "El costo ingresado ya incluye IVA — se extrae la base para el inventario."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Detalle: motivo / referencia / destino / notas */}
                        {config.contextFields.length > 0 && (
                            <div className="pt-2 border-t border-border-light/60">
                                <div className={groupLabelCls + " mt-4"}>
                                    <span className="w-1 h-1 rounded-full bg-primary-500" aria-hidden />
                                    Detalle de la operación
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <OperationContextFields
                                        fields={config.contextFields}
                                        values={form.context}
                                        onChange={form.setContextField}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Items grid */}
                <OperationItemsGrid
                    items={form.items}
                    products={form.products}
                    getProduct={form.getProduct}
                    isOutbound={form.resolvedDirection.isOutbound}
                    enableLineAdjustments={config.enableLineAdjustments}
                    rowBalanceLabel={config.labels.rowBalanceLabel}
                    rowBalanceAfterLabel={config.labels.rowBalanceAfterLabel}
                    costLabel={form.costLabel}
                    dollarRate={form.dollarRate}
                    ivaMode={form.ivaMode}
                    hasIva={form.hasIva}
                    totals={form.totals}
                    onPatch={form.updateItem}
                    onAddRow={form.addRow}
                    onRemoveRow={form.removeRow}
                />

                {/* Direction-specific footer note */}
                {directionFooterNote && (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg border border-border-light bg-surface-1 shadow-sm">
                        <Info size={14} strokeWidth={2} className="text-[var(--text-tertiary)] mt-0.5 flex-shrink-0" />
                        <p className="font-sans text-[12px] text-[var(--text-secondary)] leading-relaxed">
                            {directionFooterNote}
                        </p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pb-8">
                    <BaseButton.Root
                        variant="secondary"
                        size="md"
                        onClick={() => router.back()}
                        disabled={form.saving}
                    >
                        Cancelar
                    </BaseButton.Root>
                    <BaseButton.Root
                        variant="primary"
                        size="md"
                        onClick={form.handleSave}
                        disabled={form.saving}
                        loading={form.saving}
                    >
                        {form.saving ? config.labels.submittingButton : config.labels.submitButton}
                    </BaseButton.Root>
                </div>
            </div>
        </div>
    );
}
