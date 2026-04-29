"use client";

import { GuidedStepShell, StepSection, AdvancedDisclosure } from "@/src/modules/payroll/frontend/components/guided/guided-step-shell";

export type GenAutoMode = "none" | "porcentaje" | "monto";

export interface GenStepOpcionesProps {
    markupStr: string;
    setMarkupStr: (v: string) => void;
    countStr: string;
    setCountStr: (v: string) => void;
    autoMode: GenAutoMode;
    setAutoMode: (v: GenAutoMode) => void;
    autoTargetStr: string;
    setAutoTargetStr: (v: string) => void;
    reference: string;
    setReference: (v: string) => void;
    onBack: () => void;
    onNext: () => void;
}

const labelCls =
    "font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-1.5 block";

const fieldCls = [
    "h-11 px-3 rounded-lg border border-border-light bg-surface-1 outline-none w-full",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

function isValidMarkup(str: string): boolean {
    const n = Number(str.replace(",", "."));
    return Number.isFinite(n) && n > -100;
}

function isValidAutoTarget(str: string): boolean {
    const n = Number(str.replace(",", "."));
    return Number.isFinite(n) && n >= 0;
}

export function GenStepOpciones({
    markupStr,
    setMarkupStr,
    countStr,
    setCountStr,
    autoMode,
    setAutoMode,
    autoTargetStr,
    setAutoTargetStr,
    reference,
    setReference,
    onBack,
    onNext,
}: GenStepOpcionesProps) {
    const markupInvalid = markupStr.trim() !== "" && !isValidMarkup(markupStr);
    const autoTargetInvalid = autoMode !== "none" && (autoTargetStr.trim() === "" || !isValidAutoTarget(autoTargetStr));

    const nextDisabled = markupInvalid || autoTargetInvalid;

    return (
        <GuidedStepShell
            title="Ajusta el markup y el autoconsumo"
            subtitle="Define el margen unitario, opcionalmente reserva una porción del target a autoconsumo y elige una referencia para identificar la operación."
            onBack={onBack}
            onNext={onNext}
            nextDisabled={nextDisabled}
            centerHeader
        >
            <StepSection
                title="Markup unitario"
                description="Precio de venta = costo × (1 + markup/100). Aplica uniforme a todas las líneas."
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelCls}>Markup % unitario</label>
                        <input
                            inputMode="decimal"
                            className={fieldCls}
                            value={markupStr}
                            placeholder="30"
                            onChange={(e) => setMarkupStr(e.target.value)}
                        />
                        {markupInvalid && (
                            <p className="mt-1.5 font-mono text-[11px] text-red-400">
                                Markup debe ser mayor a -100
                            </p>
                        )}
                    </div>
                </div>
            </StepSection>

            <StepSection
                title="Autoconsumo"
                description="Reserva parte del target a movimientos tipo autoconsumo (productos disjuntos respecto a las salidas)."
            >
                <label className={labelCls}>Modo</label>
                <div className="flex rounded-lg border border-border-light overflow-hidden bg-surface-1 mb-4">
                    {([
                        { v: "none",       l: "Sin autoconsumo" },
                        { v: "porcentaje", l: "% del target"     },
                        { v: "monto",      l: "Monto Bs."        },
                    ] as const).map((m) => (
                        <button
                            key={m.v}
                            type="button"
                            onClick={() => setAutoMode(m.v)}
                            className={[
                                "flex-1 h-11 text-[12px] uppercase tracking-[0.12em] transition-colors font-mono",
                                autoMode === m.v
                                    ? "bg-amber-500/15 text-amber-600 font-bold"
                                    : "text-[var(--text-tertiary)] hover:bg-surface-2",
                            ].join(" ")}
                        >
                            {m.l}
                        </button>
                    ))}
                </div>

                {autoMode !== "none" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}>
                                {autoMode === "porcentaje"
                                    ? "% del target a autoconsumo"
                                    : "Bs. sin IVA a autoconsumo"}
                            </label>
                            <input
                                inputMode="decimal"
                                className={fieldCls}
                                value={autoTargetStr}
                                placeholder={autoMode === "porcentaje" ? "10" : "1.500,00"}
                                onChange={(e) => setAutoTargetStr(e.target.value)}
                                autoFocus
                            />
                            {autoTargetInvalid && (
                                <p className="mt-1.5 font-mono text-[11px] text-red-400">
                                    {autoMode === "porcentaje"
                                        ? "Ingresa un porcentaje válido (≥ 0)"
                                        : "Ingresa un monto válido (≥ 0)"}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </StepSection>

            <StepSection
                title="Referencia"
                description="Texto que identificará todos los movimientos generados."
            >
                <input
                    className={fieldCls}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Generado automáticamente"
                />
            </StepSection>

            <AdvancedDisclosure label="Avanzado · cantidad de líneas">
                <p className="font-mono text-[13px] text-[var(--text-tertiary)] leading-relaxed">
                    Por defecto el sistema decide cuántas líneas generar (entre 3 y 30, según los productos elegibles).
                    Si lo prefieres, fija manualmente el número de líneas a generar.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div>
                        <label className={labelCls}>Líneas (opcional)</label>
                        <input
                            inputMode="numeric"
                            className={fieldCls}
                            value={countStr}
                            placeholder="auto"
                            onChange={(e) => setCountStr(e.target.value)}
                        />
                    </div>
                </div>
            </AdvancedDisclosure>
        </GuidedStepShell>
    );
}
