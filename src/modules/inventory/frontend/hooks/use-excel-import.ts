// use-excel-import.ts — orchestrates the Excel import process.
// Architectural role: coordinates parsing, department creation, product upsert,
// and movement creation in batched phases with progress reporting.
// Depends on useInventory for save operations and useCompany for config.
"use client";

import { useCallback, useRef, useState } from "react";
import { useInventory } from "./use-inventory";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { CustomFieldDefinition, InventoryConfig } from "@/src/modules/companies/frontend/hooks/use-companies";
import type { Product } from "@/src/modules/inventory/backend/domain/product";
import type { Movement } from "@/src/modules/inventory/backend/domain/movement";
import type { ExcelImportRow } from "../utils/inventory-excel";

// ── Progress state ──────────────────────────────────────────────────────────

export interface ImportProgress {
  phase: "idle" | "departments" | "customFields" | "products" | "movements" | "done" | "error";
  current: number;
  total: number;
  errors: Array<{ row: number; message: string }>;
  created: { departments: number; products: number; movements: number };
  updated: { products: number };
  skipped: number;
}

function createInitialProgress(): ImportProgress {
  return {
    phase: "idle",
    current: 0,
    total: 0,
    errors: [],
    created: { departments: 0, products: 0, movements: 0 },
    updated: { products: 0 },
    skipped: 0,
  };
}

// ── Import configuration ────────────────────────────────────────────────────

export interface ImportConfig {
  period: string;    // YYYY-MM
  date: string;      // YYYY-MM-DD
  reference: string;
  /** Catalog-only by default. Positive stock requires a valuation cost; negative stock may start at zero cost. */
  importInitialStock: boolean;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useExcelImport() {
  const {
    loadProducts, loadDepartments,
    saveProductDetailed, saveDepartment, saveMovement,
  } = useInventory();
  const { companyId, company, saveInventoryConfig } = useCompany();

  const [progress, setProgress] = useState<ImportProgress>(createInitialProgress);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    setProgress(createInitialProgress());
    cancelledRef.current = false;
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  // Yield to event loop between batches to keep UI responsive.
  const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0));

  const executeImport = useCallback(async (
    rows: ExcelImportRow[],
    newCustomFields: CustomFieldDefinition[],
    config: ImportConfig,
  ) => {
    if (!companyId) return;
    cancelledRef.current = false;

    // Use the values returned by the requests. React state updates are async and
    // still contain the previous catalog during this import callback.
    const freshProducts = await loadProducts(companyId, true);
    const freshDepartments = await loadDepartments(companyId, true);

    const localProgress = createInitialProgress();
    if (!freshProducts || !freshDepartments) {
      localProgress.phase = "error";
      localProgress.errors.push({ row: 0, message: "No se pudo cargar el catálogo actual antes de importar." });
      setProgress({ ...localProgress });
      return;
    }
    const update = (partial: Partial<ImportProgress>) => {
      Object.assign(localProgress, partial);
      setProgress({ ...localProgress });
    };

    // Resolve identity before any writes. Barcode is authoritative for scanner-facing
    // products; internal code is the fallback. A disagreement is blocking because it
    // could attach a purchase to the wrong product.
    const existingByCode = new Map(freshProducts.filter((p) => p.code).map((p) => [p.code, p]));
    const existingByBarcode = new Map(freshProducts.filter((p) => p.barcode).map((p) => [p.barcode!, p]));
    for (const row of rows) {
      const byCode = existingByCode.get(row.product.code);
      const byBarcode = row.product.barcode ? existingByBarcode.get(row.product.barcode) : undefined;
      if (byCode && byBarcode && byCode.id !== byBarcode.id) {
        localProgress.errors.push({
          row: row.sourceRow,
          message: `El código ${row.product.code} y el barcode ${row.product.barcode} pertenecen a productos distintos.`,
        });
      }
    }
    if (localProgress.errors.length > 0) {
      update({ phase: "error", errors: localProgress.errors });
      return;
    }

    // ── Phase 1: Departments ──────────────────────────────────────────────

    update({ phase: "departments" });
    const uniqueDepts = [...new Set(
      rows.map(r => r.departmentName).filter((d): d is string => !!d?.trim()),
    )];

    // Build a mutable map of department name (uppercase) → id
    const deptMap = new Map<string, string>();
    for (const d of freshDepartments) {
      deptMap.set(d.name.toUpperCase(), d.id ?? "");
    }

    update({ total: uniqueDepts.length });
    for (const deptName of uniqueDepts) {
      if (cancelledRef.current) return;
      const key = deptName.toUpperCase();
      if (!deptMap.has(key)) {
        const saved = await saveDepartment({ companyId, name: deptName, active: true });
        if (saved?.id) {
          deptMap.set(key, saved.id);
          localProgress.created.departments++;
        }
      }
      localProgress.current++;
      setProgress({ ...localProgress });
    }

    // ── Phase 2: Custom fields ────────────────────────────────────────────

    if (newCustomFields.length > 0) {
      update({ phase: "customFields", current: 0, total: newCustomFields.length });
      const existingConfig: InventoryConfig = company?.inventoryConfig ?? { customFields: [] };
      const existingKeys = new Set(existingConfig.customFields.map(f => f.key));
      const toAdd = newCustomFields.filter(f => !existingKeys.has(f.key));

      if (toAdd.length > 0) {
        const updatedConfig: InventoryConfig = {
          ...existingConfig,
          customFields: [...existingConfig.customFields, ...toAdd],
        };
        await saveInventoryConfig(companyId, updatedConfig);
      }
      update({ current: newCustomFields.length });
    }

    // ── Phase 3: Products (batched) ───────────────────────────────────────

    update({ phase: "products", current: 0, total: rows.length });
    const BATCH_SIZE = 50;
    const productIdMap = new Map<string, string>(); // code → id

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      if (cancelledRef.current) return;
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        if (cancelledRef.current) return;

        const existing = (row.product.barcode ? existingByBarcode.get(row.product.barcode) : undefined)
          ?? (row.product.code ? existingByCode.get(row.product.code) : undefined);
        const deptId = row.departmentName ? deptMap.get(row.departmentName.toUpperCase()) : undefined;

        const product: Product = {
          id: existing?.id,
          companyId,
          code: row.product.code,
          barcode: row.product.barcode ?? existing?.barcode,
          name: row.product.name,
          description: existing?.description ?? "",
          type: existing?.type ?? "mercancia",
          measureUnit: row.product.measureUnit ?? existing?.measureUnit ?? "unidad",
          valuationMethod: existing?.valuationMethod ?? "promedio_ponderado",
          currentStock: existing?.currentStock ?? 0,
          averageCost: existing?.averageCost ?? 0,
          active: true,
          departmentId: deptId ?? existing?.departmentId,
          vatType: row.product.vatType,
          salePricing: row.product.salePricing ?? existing?.salePricing,
          customFields: { ...(existing?.customFields ?? {}), ...row.customFields },
        };

        const result = await saveProductDetailed(product);
        const saved = result.product;
        if (saved?.id) {
          productIdMap.set(row.product.code, saved.id);
          if (existing) localProgress.updated.products++;
          else localProgress.created.products++;
          if (saved.code) existingByCode.set(saved.code, saved);
          if (saved.barcode) existingByBarcode.set(saved.barcode, saved);
        } else {
          localProgress.skipped++;
          localProgress.errors.push({
            row: row.sourceRow,
            message: `${row.product.name}: ${result.error ?? "No se pudo guardar el producto"}`,
          });
        }
        localProgress.current++;
        setProgress({ ...localProgress });
      }

      await yieldToUi();
    }

    // ── Phase 4: Movements (batched) ──────────────────────────────────────

    // Count how many movements we'll create
    let movementTotal = 0;
    for (const row of rows) {
      if (config.importInitialStock && (
        row.initialStock < 0 || (row.initialStock > 0 && (row.initialCost > 0 || row.averageCost > 0))
      )) movementTotal++;
      if (row.entradaQty > 0) movementTotal++;
      if (row.salidaQty > 0) movementTotal++;
      if (row.autoconsumoQty > 0) movementTotal++;
    }

    update({ phase: "movements", current: 0, total: movementTotal });

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      if (cancelledRef.current) return;
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        if (cancelledRef.current) return;

        const productId = productIdMap.get(row.product.code);
        if (!productId) continue; // product creation failed, skip movements

        const baseMovement: Omit<Movement, "id" | "type" | "quantity" | "unitCost" | "totalCost" | "balanceQuantity"> = {
          companyId,
          productId,
          date: config.date,
          period: config.period,
          reference: config.reference,
          notes: "",
          currency: row.currency ?? undefined,
          dollarRate: row.dollarRate ?? undefined,
        };

        // 1. Initial stock as a signed adjustment. Legacy negative balances are
        // valid migration state and must remain negative until replenished.
        const shouldImportInitialStock = config.importInitialStock && (
          row.initialStock < 0 || (row.initialStock > 0 && (row.initialCost > 0 || row.averageCost > 0))
        );
        if (shouldImportInitialStock) {
          const unitCost = row.initialStock > 0 && row.initialCost > 0
            ? row.initialCost / row.initialStock
            : row.averageCost || 0;
          await saveMovement({
            ...baseMovement,
            type: row.initialStock < 0 ? "ajuste_negativo" : "ajuste_positivo",
            quantity: Math.abs(row.initialStock),
            unitCost,
            totalCost: Math.abs(row.initialStock) * unitCost,
            balanceQuantity: row.initialStock,
          } as Movement);
          localProgress.created.movements++;
          localProgress.current++;
          setProgress({ ...localProgress });
        }

        // 2. Entries
        if (row.entradaQty > 0) {
          const unitCost = row.entradaCost > 0 && row.entradaQty > 0
            ? row.entradaCost / row.entradaQty
            : row.averageCost || 0;
          await saveMovement({
            ...baseMovement,
            type: "entrada",
            quantity: row.entradaQty,
            unitCost,
            totalCost: row.entradaQty * unitCost,
            balanceQuantity: row.initialStock + row.entradaQty,
          } as Movement);
          localProgress.created.movements++;
          localProgress.current++;
          setProgress({ ...localProgress });
        }

        // 3. Exits
        if (row.salidaQty > 0) {
          const unitCost = row.salidaCost > 0 && row.salidaQty > 0
            ? row.salidaCost / row.salidaQty
            : row.averageCost || 0;
          await saveMovement({
            ...baseMovement,
            type: "salida",
            quantity: row.salidaQty,
            unitCost,
            totalCost: row.salidaQty * unitCost,
            balanceQuantity: row.initialStock + row.entradaQty - row.salidaQty,
          } as Movement);
          localProgress.created.movements++;
          localProgress.current++;
          setProgress({ ...localProgress });
        }

        // 4. Self-consumption
        if (row.autoconsumoQty > 0) {
          await saveMovement({
            ...baseMovement,
            type: "autoconsumo",
            quantity: row.autoconsumoQty,
            unitCost: row.averageCost || 0,
            totalCost: row.autoconsumoQty * (row.averageCost || 0),
            balanceQuantity: row.initialStock + row.entradaQty - row.salidaQty - row.autoconsumoQty,
          } as Movement);
          localProgress.created.movements++;
          localProgress.current++;
          setProgress({ ...localProgress });
        }
      }

      await yieldToUi();
    }

    update({ phase: "done" });
  }, [companyId, company, loadProducts, loadDepartments, saveProductDetailed, saveDepartment, saveMovement, saveInventoryConfig]);

  return { progress, executeImport, reset, cancel };
}
