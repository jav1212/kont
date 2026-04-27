"use client";

// OperationKindSelector — "step 0" entry surface for the operations workspace.
// Three cards (Ajuste / Devolución / Autoconsumo). On click, the workspace
// transitions to the OperationForm with the chosen kind.

import { ArrowRight, ChevronLeft, Pencil, RotateCcw, PackageMinus, type LucideIcon } from "lucide-react";

import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import type { OperationKind } from "./operation-types";

interface KindOption {
    kind: OperationKind;
    code: string;
    label: string;
    description: string;
    helper: string;
    icon: LucideIcon;
}

const OPTIONS: KindOption[] = [
    {
        kind: "adjustment",
        code: "AJU",
        label: "Ajuste",
        description: "Corrige existencias por diferencia de inventario físico.",
        helper: "Conteo, merma, daño o corrección de error.",
        icon: Pencil,
    },
    {
        kind: "return",
        code: "DEV",
        label: "Devolución",
        description: "Mercancía que regresa al proveedor o de un cliente.",
        helper: "Asociada a una nota de crédito o guía de devolución.",
        icon: RotateCcw,
    },
    {
        kind: "self-consumption",
        code: "AUT",
        label: "Autoconsumo",
        description: "Retiro de inventario para uso interno de la empresa.",
        helper: "Administración, producción, mantenimiento u obsequio.",
        icon: PackageMinus,
    },
];

interface Props {
    onSelect: (kind: OperationKind) => void;
}

export function OperationKindSelector({ onSelect }: Props) {
    return (
        <div className="min-h-full">
            <PageHeader
                title="Nueva Operación"
                subtitle="Ajuste · Devolución · Autoconsumo"
            >
                <BaseButton.Root
                    as={Link}
                    href="/inventory/operations"
                    variant="secondary"
                    size="sm"
                    leftIcon={<ChevronLeft size={14} strokeWidth={2} />}
                >
                    Tablero de operaciones
                </BaseButton.Root>
            </PageHeader>
            <div className="px-8 py-10">
                <div className="max-w-5xl mx-auto">
                    <div className="flex items-center gap-3 mb-5">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary-500">
                            Paso 1 de 2
                        </span>
                        <span className="h-px flex-1 bg-border-light" aria-hidden />
                        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                            Tipo de operación
                        </span>
                    </div>
                    <h2 className="font-sans text-[22px] font-bold leading-tight text-foreground mb-1">
                        ¿Qué operación quieres registrar?
                    </h2>
                    <p className="font-sans text-[14px] text-[var(--text-secondary)] mb-8 max-w-2xl">
                        Selecciona el tipo de movimiento manual. En el siguiente paso definirás la dirección, los productos y el detalle.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {OPTIONS.map(({ kind, code, label, description, helper, icon: Icon }) => (
                            <button
                                key={kind}
                                type="button"
                                onClick={() => onSelect(kind)}
                                className={[
                                    "group relative text-left rounded-xl bg-surface-1 shadow-sm",
                                    "border border-border-light hover:border-primary-500/60",
                                    "p-5 transition-colors duration-150",
                                    "focus:outline-none focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/20",
                                ].join(" ")}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <span
                                        className={[
                                            "inline-flex w-10 h-10 items-center justify-center rounded-lg",
                                            "bg-primary-500/10 border border-primary-500/20 text-primary-500",
                                            "group-hover:bg-primary-500/15 group-hover:border-primary-500/30 transition-colors",
                                        ].join(" ")}
                                    >
                                        <Icon size={18} strokeWidth={1.8} />
                                    </span>
                                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                                        {code}
                                    </span>
                                </div>
                                <div className="font-mono text-[14px] font-bold uppercase tracking-[0.14em] text-foreground mb-1.5">
                                    {label}
                                </div>
                                <p className="font-sans text-[13px] leading-snug text-[var(--text-secondary)] mb-3">
                                    {description}
                                </p>
                                <div className="pt-3 border-t border-border-light/60 flex items-center justify-between gap-3">
                                    <span className="font-sans text-[12px] text-[var(--text-tertiary)] leading-snug">
                                        {helper}
                                    </span>
                                    <span
                                        className={[
                                            "inline-flex w-7 h-7 items-center justify-center rounded-md flex-shrink-0",
                                            "text-[var(--text-tertiary)] group-hover:text-primary-500",
                                            "group-hover:bg-primary-500/10 transition-colors",
                                        ].join(" ")}
                                        aria-hidden
                                    >
                                        <ArrowRight size={14} strokeWidth={2} />
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
