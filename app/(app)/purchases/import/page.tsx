"use client";

import { useEffect } from "react";
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

/**
 * Provides the active company and catalogs to the guided purchase CSV importer.
 * @returns The authenticated import page with resumable company-scoped batches.
 */
export default function PurchaseImportPage() {
    const { companyId, company } = useCompany();
    const importer = usePurchaseImport();
    const { loadResumable, reset } = importer;
    const { products, loadProducts } = useInventory();
    const { suppliers, loadSuppliers, purchaseInvoices, loadPurchaseInvoices } = usePurchases();
    useEffect(() => { reset(); }, [companyId, reset]);
    useEffect(() => {
        if (companyId) {
            void loadProducts(companyId);
            void loadSuppliers(companyId);
            void loadPurchaseInvoices(companyId);
            void loadResumable(companyId);
        }
    }, [companyId, loadResumable, loadProducts, loadSuppliers, loadPurchaseInvoices]);
    const configuredUnit = company?.inventoryConfig?.defaultMeasureUnit;
    const measureUnit = configuredUnit && ["unidad", "kg", "g", "m", "m2", "m3", "litro", "galon", "caja", "rollo", "paquete"].includes(configuredUnit)
        ? configuredUnit as MeasureUnit : "unidad";
    return (
        <div className="min-h-full bg-background">
            <PageHeader title="Importar compras" subtitle={company ? `Asistente CSV · ${company.name}` : "Selecciona una empresa"}>
                <BaseButton.Root as={Link} href="/purchases" variant="ghost" size="sm" leftIcon={<ArrowLeft size={14} />}>Volver a compras</BaseButton.Root>
            </PageHeader>
            <PurchaseImportWizard
                key={companyId ?? "no-company"}
                companyId={companyId ?? undefined}
                session={importer.session}
                batch={importer.batch}
                resumable={importer.resumable}
                products={products}
                suppliers={suppliers}
                purchaseInvoices={purchaseInvoices}
                defaults={{ measureUnit, valuationMethod: company?.inventoryConfig?.defaultValuationMethod === "peps" ? "peps" : "promedio_ponderado" }}
                loading={importer.loading}
                error={importer.error}
                onResume={id => { if (companyId) void importer.resume(companyId, id); }}
                onFiles={(stage, files) => { if (companyId) void importer.submitFiles(stage, companyId, files, company?.rif || companyId, importer.batch?.id); }}
                onUpdate={payload => companyId ? importer.updateSession(companyId, payload) : Promise.resolve(null)}
                onExecute={mode => {
                    if (companyId) void importer.execute(companyId, mode).then(result => {
                        if (result) {
                            void loadPurchaseInvoices(companyId);
                            void loadProducts(companyId);
                            void loadSuppliers(companyId);
                        }
                    });
                }}
                onReset={reset}
            />
        </div>
    );
}
