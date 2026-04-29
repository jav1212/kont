"use client";

// Page: Generador de salidas aleatorias (modo guiado).
// Stepper de 3 pasos: Período → Opciones → Vista previa.
// La confirmación final se hace vía Modal antes de persistir.

import { useCallback, useMemo, useState } from "react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import {
    useInventory,
    type RandomSalesPreview,
    type RandomSalesPreviewLine,
} from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { notify } from "@/src/shared/frontend/notify";

import {
    GuidedStepperHeader,
    type StepDef,
} from "@/src/modules/payroll/frontend/components/guided/guided-stepper-header";
import {
    GenStepConfig,
    type GenMode,
} from "@/src/modules/inventory/frontend/components/guided/gen-step-config";
import {
    GenStepOpciones,
    type GenAutoMode,
} from "@/src/modules/inventory/frontend/components/guided/gen-step-opciones";
import { GenStepPreview } from "@/src/modules/inventory/frontend/components/guided/gen-step-preview";
import { GenConfirmDialog } from "@/src/modules/inventory/frontend/components/guided/gen-confirm-dialog";

const STEPS: StepDef[] = [
    { id: 1, label: "Período" },
    { id: 2, label: "Opciones" },
    { id: 3, label: "Vista previa" },
];

function currentPeriod(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function SalesGeneratorPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const { saveOutbound, generateRandomSales } = useInventory();

    const [currentStep, setCurrentStep] = useState(1);

    // Step 1
    const [period, setPeriod] = useState<string>(currentPeriod());
    const [mode, setMode] = useState<GenMode>("monto");
    const [targetStr, setTargetStr] = useState<string>("");

    // Step 2
    const [markupStr, setMarkupStr] = useState<string>("30");
    const [countStr, setCountStr] = useState<string>("");
    const [reference, setReference] = useState<string>("Generado automáticamente");
    const [autoMode, setAutoMode] = useState<GenAutoMode>("none");
    const [autoTargetStr, setAutoTargetStr] = useState<string>("");

    // Step 3
    const [preview, setPreview] = useState<RandomSalesPreview | null>(null);
    const [lines, setLines] = useState<RandomSalesPreviewLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    // Modal
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);

    const toggleRow = useCallback((idx: number) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    }, []);

    const generate = useCallback(async (opts?: { newSeed?: boolean }) => {
        if (!companyId) return;
        const target = Number(targetStr.replace(",", "."));
        if (!Number.isFinite(target)) {
            notify.error("Ingresa un target numérico válido");
            return;
        }
        const markupPct = Number(markupStr.replace(",", "."));
        if (!Number.isFinite(markupPct) || markupPct <= -100) {
            notify.error("Ingresa un markup % válido (mayor a -100)");
            return;
        }
        const count = countStr.trim() ? Number(countStr) : undefined;

        let autoTarget: number | undefined;
        if (autoMode !== "none") {
            const parsed = Number(autoTargetStr.replace(",", "."));
            if (!Number.isFinite(parsed) || parsed < 0) {
                notify.error(autoMode === "porcentaje"
                    ? "Ingresa un porcentaje de autoconsumo válido"
                    : "Ingresa un monto Bs de autoconsumo válido");
                return;
            }
            autoTarget = parsed;
        }

        setLoading(true);
        const result = await generateRandomSales({
            companyId,
            period,
            mode,
            target,
            markupPct,
            count: count != null && Number.isFinite(count) ? count : undefined,
            seed: opts?.newSeed ? Math.floor(Math.random() * 0xffffffff) : undefined,
            autoconsumoMode: autoMode,
            autoconsumoTarget: autoTarget,
        });
        setLoading(false);
        if (result) {
            setPreview(result);
            const combined: RandomSalesPreviewLine[] = [
                ...result.lines,
                ...result.autoconsumoLines,
            ].sort((a, b) => {
                if (a.tipo !== b.tipo) return a.tipo === "salida" ? -1 : 1;
                return a.date.localeCompare(b.date);
            });
            setLines(combined);
            setExpandedRows(new Set());
        }
    }, [companyId, period, mode, targetStr, markupStr, countStr, autoMode, autoTargetStr, generateRandomSales]);

    const goBack = useCallback(() => {
        setCurrentStep((s) => Math.max(1, s - 1));
    }, []);

    const goToStep = useCallback((step: number) => {
        // If user jumps back to step 1 or 2, drop the preview so step 3 regenerates.
        if (step < currentStep && step < 3) {
            setPreview(null);
            setLines([]);
            setExpandedRows(new Set());
        }
        setCurrentStep(step);
    }, [currentStep]);

    const goNextFromStep1 = useCallback(() => {
        setPreview(null);
        setLines([]);
        setExpandedRows(new Set());
        setCurrentStep(2);
    }, []);

    const goNextFromStep2 = useCallback(() => {
        setPreview(null);
        setLines([]);
        setExpandedRows(new Set());
        setCurrentStep(3);
        // Trigger generation as a side-effect of the user action (not via useEffect)
        // so we don't risk cascading renders or auto-retry on API failure.
        void generate({ newSeed: false });
    }, [generate]);

    const removeLine = useCallback((idx: number) => {
        setLines((prev) => prev.filter((_, i) => i !== idx));
        setExpandedRows((prev) => {
            const next = new Set<number>();
            for (const i of prev) {
                if (i < idx) next.add(i);
                else if (i > idx) next.add(i - 1);
            }
            return next;
        });
    }, []);

    const updateQty = useCallback((idx: number, qty: number) => {
        setLines((prev) =>
            prev.map((l, i) => {
                if (i !== idx) return l;
                const safeQty = Math.max(0, qty);
                const totalSinIVA = Math.round(l.precioVentaUnitario * safeQty * 100) / 100;
                const ivaPct = l.vatType === "general" ? 0.16 : 0;
                const iva = Math.round(totalSinIVA * ivaPct * 100) / 100;
                return {
                    ...l,
                    quantity: safeQty,
                    totalSinIVA,
                    iva,
                    totalConIVA: Math.round((totalSinIVA + iva) * 100) / 100,
                };
            }),
        );
    }, []);

    const sumSinIVA = useMemo(() => lines.reduce((s, l) => s + l.totalSinIVA, 0), [lines]);
    const sumIVA = useMemo(() => lines.reduce((s, l) => s + l.iva, 0), [lines]);
    const sumConIVA = useMemo(() => lines.reduce((s, l) => s + l.totalConIVA, 0), [lines]);

    const confirm = useCallback(async () => {
        if (!companyId) return;
        if (lines.length === 0) {
            notify.error("No hay líneas que confirmar");
            return;
        }
        const invalid = lines.find((l) => l.quantity <= 0);
        if (invalid) {
            notify.error(`La línea de ${invalid.productName} tiene cantidad ≤ 0`);
            return;
        }

        // Stock shortfall combinado por producto (salida + autoconsumo) — sólo informativo:
        // se permite vender más de lo que dice el inventario porque al iniciar con el sistema
        // no se cuenta con historial completo. El backend acepta el shortfall enviando
        // currentStock=undefined, salteando el chequeo de SaveMovementUseCase.
        setSaving(true);
        const ok = await saveOutbound({
            companyId,
            date: lines[0].date,
            reference,
            items: lines.map((l) => ({
                productId: l.productId,
                quantity: l.quantity,
                precioVentaUnitario: l.precioVentaUnitario,
                date: l.date,
                type: l.tipo,
            })),
        });
        setSaving(false);
        if (ok) {
            setShowConfirmDialog(false);
            router.push(`/inventory/movements?period=${encodeURIComponent(period)}`);
        }
    }, [companyId, lines, reference, period, saveOutbound, router]);

    return (
        <div className="min-h-full bg-surface-2 font-mono flex flex-col">
            <PageHeader
                title="Generador de salidas"
                subtitle="Distribuye un monto o margen objetivo en salidas aleatorias del periodo, con opción de carve-out a autoconsumo"
            />

            <GuidedStepperHeader
                steps={STEPS}
                currentStep={currentStep}
                onStepClick={goToStep}
            />

            <div className="flex-1 overflow-hidden flex flex-col">
                {currentStep === 1 && (
                    <GenStepConfig
                        period={period}
                        setPeriod={setPeriod}
                        mode={mode}
                        setMode={setMode}
                        targetStr={targetStr}
                        setTargetStr={setTargetStr}
                        onNext={goNextFromStep1}
                    />
                )}

                {currentStep === 2 && (
                    <GenStepOpciones
                        markupStr={markupStr}
                        setMarkupStr={setMarkupStr}
                        countStr={countStr}
                        setCountStr={setCountStr}
                        autoMode={autoMode}
                        setAutoMode={setAutoMode}
                        autoTargetStr={autoTargetStr}
                        setAutoTargetStr={setAutoTargetStr}
                        reference={reference}
                        setReference={setReference}
                        onBack={goBack}
                        onNext={goNextFromStep2}
                    />
                )}

                {currentStep === 3 && (
                    <GenStepPreview
                        preview={preview}
                        lines={lines}
                        loading={loading}
                        saving={saving}
                        expandedRows={expandedRows}
                        onToggleRow={toggleRow}
                        onUpdateQty={updateQty}
                        onRemoveLine={removeLine}
                        onRegenerate={() => generate({ newSeed: true })}
                        onBack={goBack}
                        onConfirmRequest={() => setShowConfirmDialog(true)}
                    />
                )}
            </div>

            <GenConfirmDialog
                isOpen={showConfirmDialog}
                onClose={() => setShowConfirmDialog(false)}
                onConfirm={confirm}
                saving={saving}
                period={period}
                reference={reference}
                lines={lines}
                sumSinIVA={sumSinIVA}
                sumIVA={sumIVA}
                sumConIVA={sumConIVA}
            />
        </div>
    );
}
