"use client";

import Link from "next/link";

export default function SalidasPage() {
    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Salidas de Inventario
                        </h1>
                        <p className="text-[12px] text-text-tertiary uppercase tracking-[0.12em] mt-0.5">
                            Registro de salidas de existencias
                        </p>
                    </div>
                    <Link
                        href="/inventory/sales/new-manual"
                        className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[12px] uppercase tracking-[0.12em] transition-colors inline-flex items-center"
                    >
                        + Nueva salida manual
                    </Link>
                </div>
            </div>

            <div className="px-8 py-16 flex flex-col items-center justify-center text-center gap-3">
                <p className="text-[13px] text-text-tertiary uppercase tracking-[0.12em]">
                    Selecciona una acción para registrar una salida
                </p>
                <p className="text-[11px] text-text-tertiary">
                    Para ver los movimientos por período, consulta el reporte <strong className="text-foreground">Libro de Salidas</strong>.
                </p>
            </div>
        </div>
    );
}
