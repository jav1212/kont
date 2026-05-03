// Domain entity: MovementDraft (in-progress inventory movement)
// A draft is the staged form of a manual inventory operation (Entrada
// Manual, Adjustment, Return, Self-consumption) before it gets persisted
// as a confirmed Movement. Drafts live in their own per-tenant table so
// existing kardex/ledger queries stay unchanged.
//
// `kind` is the *form* category — used to match a draft back to the page
// that produced it. `direction` and `ivaMode` are UI hints persisted so
// the page can rehydrate the same toggle states on reanude.

import type { MovementType, MovementAdjustmentKind } from './movement';

export type MovementDraftKind =
    | 'entrada'           // purchases/new-manual
    | 'adjustment'        // operations/new (kind=adjustment)
    | 'return'            // operations/new (kind=return)
    | 'self-consumption'; // operations/new (kind=self-consumption)

export type MovementDraftDirection = 'inbound' | 'outbound';
export type MovementDraftIvaMode = 'agregado' | 'incluido';

export interface MovementDraftRow {
    id?: string;
    productId: string;
    tipo: MovementType;
    fecha: string;
    cantidad: number;
    costoUnitario: number;
    moneda: 'B' | 'D';
    costoMoneda?: number | null;
    tasaDolar?: number | null;
    referencia?: string;
    notas?: string;
    descuentoTipo?: MovementAdjustmentKind | null;
    descuentoValor?: number;
    descuentoMonto?: number;
    recargoTipo?: MovementAdjustmentKind | null;
    recargoValor?: number;
    recargoMonto?: number;
    baseIva?: number;
    precioVentaUnitario?: number | null;
}

export interface MovementDraftSaveInput {
    companyId: string;
    draftGroupId?: string | null;
    kind: MovementDraftKind;
    direction: MovementDraftDirection;
    ivaMode: MovementDraftIvaMode;
    context: Record<string, unknown>;
    movements: MovementDraftRow[];
}

export interface MovementDraftSaveResult {
    draftGroupId: string;
    count: number;
    updatedAt: string;
}

export interface MovementDraftSummary {
    draftGroupId: string;
    kind: MovementDraftKind;
    direction: MovementDraftDirection;
    ivaMode: MovementDraftIvaMode;
    context: Record<string, unknown>;
    count: number;
    totalCantidad: number;
    updatedAt: string;
}

export interface MovementDraftGroupMeta {
    draftGroupId: string;
    kind: MovementDraftKind;
    direction: MovementDraftDirection;
    ivaMode: MovementDraftIvaMode;
    context: Record<string, unknown>;
    fecha: string;
    updatedAt: string;
}

export interface MovementDraftGroup {
    meta: MovementDraftGroupMeta;
    items: MovementDraftRow[];
}

export interface MovementDraftConfirmResult {
    count: number;
    confirmedIds: string[];
}
