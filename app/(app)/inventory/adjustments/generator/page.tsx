"use client";

// Page: Generador de ajustes de existencia (modo guiado).
// Stepper de 3 pasos: Período & Base → Filtros → Vista previa.
// El ajuste actualiza directamente product.currentStock — NO crea movimientos
// en el kardex. La confirmación final pasa por un Modal antes de persistir.

import { useCallback, useEffect, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import {
    useInventory,
    type StockAdjustmentPreview,
    type StockAdjustmentLine,
    type AdjustmentBaseSource,
    type AdjustmentMode,
} from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { notify } from "@/src/shared/frontend/notify";

import {
    GuidedStepperHeader,
    type StepDef,
} from "@/src/modules/payroll/frontend/components/guided/guided-stepper-header";
import { AdjStepConfig } from "@/src/modules/inventory/frontend/components/guided/adj-step-config";
import { AdjStepOpciones } from "@/src/modules/inventory/frontend/components/guided/adj-step-opciones";
import { AdjStepPreview } from "@/src/modules/inventory/frontend/components/guided/adj-step-preview";
import { AdjConfirmDialog } from "@/src/modules/inventory/frontend/components/guided/adj-confirm-dialog";

const STEPS: StepDef[] = [
    { id: 1, label: "Período" },
    { id: 2, label: "Filtros" },
    { id: 3, label: "Vista previa" },
];

function currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function StockAdjustmentGeneratorPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const {
        departments,
        loadDepartments,
        generateStockAdjustment,
        saveStockAdjustment,
    } = useInventory();

    const [currentStep, setCurrentStep] = useState(1);

    // Step 1
    const [period, setPeriod] = useState<string>(currentPeriod());
    const [baseSource, setBaseSource] = useState<AdjustmentBaseSource>("entradas");
    const [mode, setMode] = useState<AdjustmentMode>("porcentaje");
    const [targetStr, setTargetStr] = useState<string>("80");

    // Step 2
    const [departmentId, setDepartmentId] = useState<string>("");
    const [excludeZeroCost, setExcludeZeroCost] = useState<boolean>(true);
    const [reference, setReference] = useState<string>("");

    // Step 3
    const [preview, setPreview] = useState<StockAdjustmentPreview | null>(null);
    const [lines, setLines] = useState<StockAdjustmentLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Modal
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    // Load departments once company is known (for step 2 selector)
    useEffect(() => {
        if (companyId) void loadDepartments(companyId);
    }, [companyId, loadDepartments]);

    const generate = useCallback(async () => {
        if (!companyId) return;
        const target = Number(targetStr.replace(",", "."));
        if (!Number.isFinite(target) || target < 0) {
            notify.error("Ingresa un target numérico válido");
            return;
        }

        setLoading(true);
        const result = await generateStockAdjustment({
            companyId,
            period,
            baseSource,
            mode,
            target,
            departmentId: departmentId || undefined,
            excludeZeroCost,
        });
        setLoading(false);
        if (result) {
            setPreview(result);
            setLines(result.lines);
        }
    }, [companyId, period, baseSource, mode, targetStr, departmentId, excludeZeroCost, generateStockAdjustment]);

    const goBack = useCallback(() => {
        setCurrentStep((s) => Math.max(1, s - 1));
    }, []);

    const goToStep = useCallback((step: number) => {
        if (step < currentStep && step < 3) {
            setPreview(null);
            setLines([]);
        }
        setCurrentStep(step);
    }, [currentStep]);

    const goNextFromStep1 = useCallback(() => {
        setPreview(null);
        setLines([]);
        setCurrentStep(2);
    }, []);

    const goNextFromStep2 = useCallback(() => {
        setPreview(null);
        setLines([]);
        setCurrentStep(3);
        void generate();
    }, [generate]);

    const removeLine = useCallback((idx: number) => {
        setLines((prev) => prev.filter((_, i) => i !== idx));
    }, []);

    const updateDelta = useCallback((idx: number, deltaQty: number) => {
        setLines((prev) =>
            prev.map((l, i) => {
                if (i !== idx) return l;
                const safeDelta = Number.isFinite(deltaQty) ? deltaQty : 0;
                // No permitir stock negativo
                const minDelta = -l.currentStock;
                const clampedDelta = Math.max(minDelta, safeDelta);
                const newStock = l.currentStock + clampedDelta;
                return {
                    ...l,
                    deltaQty: clampedDelta,
                    newStock,
                    newValueBs: Math.round(newStock * l.averageCost * 100) / 100,
                    capped: clampedDelta === minDelta && safeDelta < minDelta,
                };
            }),
        );
    }, []);

    const confirm = useCallback(async () => {
        if (!companyId) return;
        if (lines.length === 0) {
            notify.error("No hay productos a ajustar");
            return;
        }

        // Sólo enviar productos cuyo deltaQty cambia el saldo
        const items = lines
            .filter((l) => l.deltaQty !== 0)
            .map((l) => ({
                productId: l.productId,
                newCurrentStock: l.newStock,
            }));

        if (items.length === 0) {
            notify.error("Ningún producto tiene un delta distinto de cero");
            return;
        }

        setSaving(true);
        const result = await saveStockAdjustment({ companyId, items });
        setSaving(false);
        if (result) {
            if (result.failed.length > 0) {
                notify.error(`Se ajustaron ${result.updated.length} productos. ${result.failed.length} fallaron.`);
            } else {
                notify.success(`Ajuste aplicado a ${result.updated.length} ${result.updated.length === 1 ? "producto" : "productos"}`);
            }
            setShowConfirmDialog(false);
            router.push(`/inventory/balance-report?period=${encodeURIComponent(period)}`);
        }
    }, [companyId, lines, period, saveStockAdjustment, router]);

    return (
        <div className="min-h-full bg-surface-2 font-mono flex flex-col">
            <PageHeader
                title="Generador de ajustes"
                subtitle="Modifica directamente la existencia de los productos hasta cuadrar con un porcentaje o monto fijo. No crea movimientos en el kardex."
            />

            <GuidedStepperHeader
                steps={STEPS}
                currentStep={currentStep}
                onStepClick={goToStep}
            />

            <div className="flex-1 overflow-hidden flex flex-col">
                {currentStep === 1 && (
                    <AdjStepConfig
                        period={period}
                        setPeriod={setPeriod}
                        baseSource={baseSource}
                        setBaseSource={setBaseSource}
                        mode={mode}
                        setMode={setMode}
                        targetStr={targetStr}
                        setTargetStr={setTargetStr}
                        onNext={goNextFromStep1}
                    />
                )}

                {currentStep === 2 && (
                    <AdjStepOpciones
                        departments={departments}
                        departmentId={departmentId}
                        setDepartmentId={setDepartmentId}
                        excludeZeroCost={excludeZeroCost}
                        setExcludeZeroCost={setExcludeZeroCost}
                        reference={reference}
                        setReference={setReference}
                        onBack={goBack}
                        onNext={goNextFromStep2}
                    />
                )}

                {currentStep === 3 && (
                    <AdjStepPreview
                        preview={preview}
                        lines={lines}
                        loading={loading}
                        saving={saving}
                        onUpdateDelta={updateDelta}
                        onRemoveLine={removeLine}
                        onRegenerate={generate}
                        onBack={goBack}
                        onConfirmRequest={() => setShowConfirmDialog(true)}
                    />
                )}
            </div>

            <AdjConfirmDialog
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={confirm}
                saving={saving}
                period={period}
                baseSource={baseSource}
                targetBs={preview?.targetBs ?? 0}
                reference={reference}
                lines={lines}
            />
        </div>
    );
}
