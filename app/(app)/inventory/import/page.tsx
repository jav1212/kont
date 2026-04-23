// Inventory Excel import page — allows users to migrate their inventory data
// from any Excel file (.xls/.xlsx) with automatic column detection.
"use client";

import { PageHeader } from "@/src/shared/frontend/components/page-header";
import { ExcelImportWizard } from "@/src/modules/inventory/frontend/components/excel-import-wizard";

export default function InventoryImportPage() {
  return (
    <div className="min-h-full bg-surface-2 font-mono">
      <PageHeader
        title="Importar Inventario"
        subtitle="Migra tu inventario desde un archivo Excel (.xls, .xlsx)"
      />
      <div className="px-8 py-6 max-w-5xl">
        <ExcelImportWizard />
      </div>
    </div>
  );
}
