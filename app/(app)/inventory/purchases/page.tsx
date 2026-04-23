"use client";

import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
// Note: Link is passed as polymorphic `as` prop to BaseButton, not used as JSX directly.

export default function EntradasPage() {
    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Entradas de Inventario" subtitle="Registro de entradas de existencias">
                <BaseButton.Root as={Link} href="/inventory/purchases/invoices" variant="secondary" size="sm">
                    Facturas
                </BaseButton.Root>
                <BaseButton.Root as={Link} href="/inventory/purchases/new-manual" variant="secondary" size="sm">
                    + Entrada manual
                </BaseButton.Root>
                <BaseButton.Root as={Link} href="/inventory/purchases/new" variant="primary" size="sm">
                    + Nueva factura
                </BaseButton.Root>
            </PageHeader>

            <div className="px-8 py-16 flex flex-col items-center justify-center text-center gap-3">
                <p className="text-[13px] text-text-tertiary uppercase tracking-[0.12em]">
                    Selecciona una acción para registrar una entrada
                </p>
                <p className="text-[11px] text-text-tertiary">
                    Para ver los movimientos por período, consulta el reporte <strong className="text-foreground">Libro de Entradas</strong>.
                </p>
            </div>
        </div>
    );
}
