"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { ContextLink as Link } from "@/src/shared/frontend/components/context-link";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { PurchaseImportWizard } from "@/src/modules/purchases/frontend/components/purchase-import-wizard";
import { usePurchaseImport } from "@/src/modules/purchases/frontend/hooks/use-purchase-import";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { usePurchases } from "@/src/modules/purchases/frontend/hooks/use-purchases";
import type { MeasureUnit } from "@/src/modules/inventory/backend/domain/product";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";

/**
 * Provides the active company and catalogs to the guided purchase CSV importer.
 * @returns The authenticated import page with a new company-scoped import session.
 */
export default function PurchaseImportPage() {
    const { companyId, company } = useCompany();
    const searchParams = useSearchParams();
    const router = useRouter();
    const targetInvoiceId = searchParams.get("invoiceId")?.trim() || undefined;
    const importer = usePurchaseImport();
    const { reset, resume } = importer;
    const { products, loadProducts } = useInventory();
    const { suppliers, loadSuppliers, purchaseInvoices, loadPurchaseInvoices } = usePurchases();
    useEffect(() => {
        reset();
        return reset;
    }, [companyId, reset, targetInvoiceId]);
    useEffect(() => {
        if (companyId && targetInvoiceId) void resume(companyId, targetInvoiceId);
    }, [companyId, resume, targetInvoiceId]);
    useEffect(() => {
        if (companyId) {
            void loadProducts(companyId);
            void loadSuppliers(companyId);
            void loadPurchaseInvoices(companyId);
        }
    }, [companyId, loadProducts, loadSuppliers, loadPurchaseInvoices]);
    const configuredUnit = company?.inventoryConfig?.defaultMeasureUnit;
    const measureUnit = configuredUnit && ["unidad", "kg", "g", "m", "m2", "m3", "litro", "galon", "caja", "rollo", "paquete"].includes(configuredUnit)
        ? configuredUnit as MeasureUnit : "unidad";
    return (
        <div className="min-h-full bg-background">
            <PageHeader title={targetInvoiceId ? "Completar compra importada" : "Importar compras"} subtitle={company ? `${targetInvoiceId ? "Productos CSV" : "Asistente CSV"} · ${company.name}` : "Selecciona una empresa"}>
                <BaseButton.Root as={Link} href={targetInvoiceId ? `/purchases/${targetInvoiceId}` : "/purchases"} variant="ghost" size="sm" leftIcon={<ArrowLeft size={14} />}>{targetInvoiceId ? "Volver al borrador" : "Volver a compras"}</BaseButton.Root>
            </PageHeader>
            <PurchaseImportWizard
                key={`${companyId ?? "no-company"}:${targetInvoiceId ?? "new"}`}
                companyId={companyId ?? undefined}
                session={importer.session}
                batch={importer.batch}
                products={products}
                suppliers={suppliers}
                purchaseInvoices={purchaseInvoices}
                defaults={{ measureUnit, valuationMethod: company?.inventoryConfig?.defaultValuationMethod === "peps" ? "peps" : "promedio_ponderado" }}
                loading={importer.loading}
                error={importer.error}
                targetInvoiceId={targetInvoiceId}
                onFiles={(stage, files) => { if (companyId) void importer.submitFiles(stage, companyId, files, company?.rif || companyId, importer.batch?.id, targetInvoiceId); }}
                onUpdate={payload => companyId ? importer.updateSession(companyId, payload, targetInvoiceId) : Promise.resolve(null)}
                onExecute={mode => {
                    if (companyId) void importer.execute(companyId, mode, targetInvoiceId).then(result => {
                        if (result) {
                            void loadPurchaseInvoices(companyId);
                            void loadProducts(companyId);
                            void loadSuppliers(companyId);
                            const completedTarget = targetInvoiceId && Array.isArray(result) && result.some((outcome) =>
                                typeof outcome === "object" && outcome !== null &&
                                "invoiceId" in outcome && outcome.invoiceId === targetInvoiceId &&
                                "status" in outcome && (outcome.status === "saved" || outcome.status === "confirmed"),
                            );
                            if (completedTarget) router.replace(`/purchases/${targetInvoiceId}`);
                        }
                    });
                }}
                onReset={reset}
            />
        </div>
    );
}
