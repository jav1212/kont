// Types for the unified inventory operation form (adjustment / return / self-consumption).
// Each operation is a multi-item movement registration that ultimately persists one
// `Movement` per row via the generic `saveMovement` use case. The differences between
// the three are declarative and live in `OperationConfig`.

import type { LineAdjustments } from "@/src/modules/inventory/shared/totals";
import type { MovementType } from "@/src/modules/inventory/backend/domain/movement";

export type OperationKind = "adjustment" | "return" | "self-consumption";

export type IvaMode = "agregado" | "incluido";

export type Currency = "B" | "D";

export interface OperationItem {
    productId: string;
    productName: string;
    quantity: number;
    currency: Currency;
    currencyCost: number;
    vatRate: number; // 0 | 0.16 (mirrors product.vatType)
    adjustments: LineAdjustments;
}

export type ContextFieldKind = "motivo" | "referencia" | "destino" | "notas";

export interface ContextField {
    kind: ContextFieldKind;
    label: string;
    placeholder?: string;
    required: boolean;
    /** Reserved for layouts that need full-width vs half-width fields. */
    fullWidth?: boolean;
}

export interface DirectionOption {
    value: MovementType;
    label: string;
    /** True when this direction reduces inventory and stock validation must run. */
    isOutbound: boolean;
    /** Default `Movement.reference` when no user-supplied reference is entered. */
    defaultReference: string;
    /** Tagline shown next to the toggle to clarify the chosen direction. */
    description: string;
    /** Optional informative footer note shown under the items grid. */
    footerNote?: string;
}

export interface FixedDirection {
    value: MovementType;
    isOutbound: boolean;
    defaultReference: string;
    description: string;
    footerNote?: string;
}

export interface OperationLabels {
    pageTitle: string;
    pageSubtitle: string;
    sectionTitle: string;
    submitButton: string;
    submittingButton: string;
    successTitle: string;
    successMessage: string;
    primaryListLabel: string;
    primaryListPath: string;
    /** Header above the toggle row for direction selection (null when fixed). */
    directionToggleLabel?: string;
    /** Label for the per-row "Existencia" column when the direction is outbound. */
    rowBalanceLabel: string;
    /** Label for the "Tras X" sub-row inside the existencia column. */
    rowBalanceAfterLabel: string;
}

export interface OperationConfig {
    kind: OperationKind;
    labels: OperationLabels;
    directionOptions: DirectionOption[] | null;
    fixedDirection: FixedDirection | null;
    contextFields: ContextField[];
    enableLineAdjustments: boolean;
    /**
     * Materializes the `Movement.reference` and `Movement.notes` fields from the
     * direction the user selected and the values entered into the context fields.
     * Each operation packages these slightly differently (e.g. self-consumption
     * concatenates "destino" and "notas" into `notes`).
     */
    buildMovementMeta: (params: {
        directionDefaultReference: string;
        context: Record<ContextFieldKind, string>;
    }) => { reference: string; notes: string };
    /**
     * Validates that all required context fields are present. Returns an error
     * string for the first missing field, or null if everything's fine.
     */
    validateContext: (context: Record<ContextFieldKind, string>) => string | null;
}
