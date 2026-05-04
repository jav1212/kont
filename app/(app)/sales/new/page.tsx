"use client";

import { ChevronLeft } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { SalesInvoiceForm } from "@/src/modules/sales/frontend/components/sales-invoice-form";

export default function NewSalesInvoicePage() {
    const router = useRouter();
    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader title="Nueva Factura de Venta" subtitle="Borrador">
                <BaseButton.Root variant="secondary" size="sm" leftIcon={<ChevronLeft size={14} strokeWidth={2} />} onClick={() => router.back()}>
                    Volver
                </BaseButton.Root>
            </PageHeader>
            <SalesInvoiceForm invoiceId={null} />
        </div>
    );
}
