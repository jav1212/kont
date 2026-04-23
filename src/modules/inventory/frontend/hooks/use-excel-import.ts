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

const INITIAL_PROGRESS: ImportProgress = {
  phase: "idle",
  current: 0,
  total: 0,
  errors: [],
  created: { departments: 0, products: 0, movements: 0 },
  updated: { products: 0 },
  skipped: 0,
};

// ── Import configuration ────────────────────────────────────────────────────

export interface ImportConfig {
  period: string;    // YYYY-MM
  date: string;      // YYYY-MM-DD
  reference: string;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useExcelImport() {
  const {
    products, departments,
    loadProducts, loadDepartments,
    saveProduct, saveDepartment, saveMovement,
  } = useInventory();
  const { companyId, company, saveInventoryConfig } = useCompany();

  const [progress, setProgress] = useState<ImportProgress>(INITIAL_PROGRESS);
  const cancelledRef = useRef(false);

  const reset = useCallback(() => {
    setProgress(INITIAL_PROGRESS);
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

    // Ensure we have fresh data
    await loadProducts(companyId);
    await loadDepartments(companyId);

    const localProgress: ImportProgress = { ...INITIAL_PROGRESS };
    const update = (partial: Partial<ImportProgress>) => {
      Object.assign(localProgress, partial);
      setProgress({ ...localProgress });
    };

    // ── Phase 1: Departments ──────────────────────────────────────────────

    update({ phase: "departments" });
    const uniqueDepts = [...new Set(
      rows.map(r => r.departmentName).filter((d): d is string => !!d?.trim()),
    )];

    // Build a mutable map of department name (uppercase) → id
    const deptMap = new Map<string, string>();
    for (const d of departments) {
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

    // Build existing product lookup by code
    const existingByCode = new Map<string, Product>();
    for (const p of products) {
      if (p.code) existingByCode.set(p.code, p);
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      if (cancelledRef.current) return;
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        if (cancelledRef.current) return;

        const existing = row.product.code ? existingByCode.get(row.product.code) : undefined;
        const deptId = row.departmentName ? deptMap.get(row.departmentName.toUpperCase()) : undefined;

        const product: Product = {
          id: existing?.id,
          companyId,
          code: row.product.code,
          name: row.product.name,
          description: existing?.description ?? "",
          type: existing?.type ?? "mercancia",
          measureUnit: existing?.measureUnit ?? "unidad",
          valuationMethod: existing?.valuationMethod ?? "promedio_ponderado",
          currentStock: 0,
          averageCost: 0,
          active: true,
          departmentId: deptId ?? existing?.departmentId,
          vatType: row.product.vatType,
          customFields: { ...(existing?.customFields ?? {}), ...row.customFields },
        };

        const saved = await saveProduct(product);
        if (saved?.id) {
          productIdMap.set(row.product.code, saved.id);
          if (existing) localProgress.updated.products++;
          else localProgress.created.products++;
        } else {
          localProgress.skipped++;
          localProgress.errors.push({
            row: i + batch.indexOf(row) + 1,
            message: `No se pudo guardar el producto "${row.product.name}"`,
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
      if (row.initialStock > 0) movementTotal++;
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

        // 1. Initial stock as ajuste_positivo
        if (row.initialStock > 0) {
          const unitCost = row.initialStock > 0 && row.initialCost > 0
            ? row.initialCost / row.initialStock
            : row.averageCost || 0;
          await saveMovement({
            ...baseMovement,
            type: "ajuste_positivo",
            quantity: row.initialStock,
            unitCost,
            totalCost: row.initialStock * unitCost,
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
  }, [companyId, company, products, departments, loadProducts, loadDepartments, saveProduct, saveDepartment, saveMovement, saveInventoryConfig]);

  return { progress, executeImport, reset, cancel };
}
