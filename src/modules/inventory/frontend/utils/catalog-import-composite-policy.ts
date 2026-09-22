import type { Product, ProductCompositionKind } from "@/src/modules/inventory/backend/domain/product";

/** The composite fields that a catalog import may safely update. */
export interface CatalogImportCompositeState {
  compositionKind?: ProductCompositionKind;
  compositionStatus?: "pending" | "ready";
  customFields: Record<string, unknown>;
}

/** Input required to preserve an existing composite product during a catalog import. */
export interface CatalogImportCompositePolicyInput {
  existing?: Pick<Product, "compositionKind" | "compositionStatus" | "customFields">;
  incomingCompositionKind?: ProductCompositionKind;
  incomingCustomFields: Record<string, unknown>;
}

/**
 * Resolves catalog-import classification without changing existing composite recipes.
 *
 * Existing composites keep their classification and readiness because a catalog file
 * has no recipe authority. An explicitly imported source origin is retained only
 * when it already identifies that existing item as a composite.
 *
 * @param input - Existing catalog state and fields parsed from one import row.
 * @returns Fields that can be included in the product upsert safely.
 */
export function resolveCatalogImportCompositeState(
  input: CatalogImportCompositePolicyInput,
): CatalogImportCompositeState {
  const existingIsComposite = input.existing?.compositionKind === "composite";
  const existingFields = input.existing?.customFields ?? {};
  const existingOrigin = existingFields.tipo_origen;
  const preservesCompositeOrigin = existingIsComposite
    && typeof existingOrigin === "string"
    && existingOrigin.trim().toLowerCase() === "compuesto";

  return {
    compositionKind: existingIsComposite
      ? "composite"
      : input.incomingCompositionKind ?? input.existing?.compositionKind,
    compositionStatus: existingIsComposite
      ? input.existing?.compositionStatus
      : input.incomingCompositionKind === "composite"
        ? "pending"
        : input.existing?.compositionStatus,
    customFields: {
      ...existingFields,
      ...input.incomingCustomFields,
      ...(preservesCompositeOrigin ? { tipo_origen: existingOrigin } : {}),
    },
  };
}
