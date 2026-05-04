"use client";

import { use } from "react";
import { ChevronLeft } from "lucide-react";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { SalesInvoiceForm } from "@/src/modules/sales/frontend/components/sales-invoice-form";
import { useSales } from "@/src/modules/sales/frontend/hooks/use-sales";

export default function SalesInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { currentSalesInvoice } = useSales();

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            <PageHeader
                title="Factura de Venta"
                subtitle={currentSalesInvoice?.invoiceNumber ? `Nº ${currentSalesInvoice.invoiceNumber}` : `#${id.slice(0, 8)}`}
            >
                {currentSalesInvoice && (
                    <span className={`inline-flex px-2 py-1 rounded border text-[11px] uppercase tracking-[0.08em] font-medium ${
                        currentSalesInvoice.status === "confirmada" ? "badge-success" :
                        currentSalesInvoice.status === "anulada" ? "badge-error" : "badge-warning"
                    }`}>
                        {currentSalesInvoice.status === "confirmada" ? "Confirmada" : currentSalesInvoice.status === "anulada" ? "Anulada" : "Borrador"}
                    </span>
                )}
                <BaseButton.Root variant="secondary" size="sm" leftIcon={<ChevronLeft size={14} strokeWidth={2} />} onClick={() => router.back()}>
                    Volver
                </BaseButton.Root>
            </PageHeader>
            <SalesInvoiceForm invoiceId={id} />
        </div>
    );
}
