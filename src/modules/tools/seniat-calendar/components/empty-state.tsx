"use client";

import { CalendarX2 } from "lucide-react";

export function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <CalendarX2 className="w-12 h-12 text-text-disabled" strokeWidth={1.5} />
            <div className="flex flex-col gap-2">
                <h3 className="text-[16px] font-sans font-semibold text-text-secondary">
                    Ingresa tu RIF para consultar
                </h3>
                <p className="text-[13px] font-mono text-text-tertiary max-w-[320px] leading-relaxed">
                    Consulta las fechas de declaración y pago de IVA, ISLR, IGTF y más obligaciones del SENIAT para tu empresa.
                </p>
            </div>
        </div>
    );
}
