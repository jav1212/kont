"use client";

import Link from "next/link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
// Note: Link is passed as polymorphic `as` prop to BaseButton, not used as JSX directly.

export default function AjustesPage() {
    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Ajustes de Inventario" subtitle="Correcciones de existencias por diferencias de inventario">
                <BaseButton.Root as={Link} href="/inventory/adjustments/new" variant="primary" size="sm">
                    + Nuevo ajuste
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-16 flex flex-col items-center justify-center text-center gap-3">
                <p className="text-[13px] text-text-tertiary uppercase tracking-[0.12em]">
                    Selecciona una acción para registrar un ajuste
                </p>
                <p className="text-[11px] text-text-tertiary">
                    Para ver todos los movimientos, consulta el reporte <strong className="text-foreground">Movimientos</strong>.
                </p>
            </div>
        </div>
    );
}
