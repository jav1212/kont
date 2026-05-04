"use client";

// useOperationForm — owns all the duplicated state and handlers that lived in
// adjustments/returns/self-consumption pages. The orchestrator component
// (`OperationForm`) consumes this hook plus the declarative `OperationConfig` to
// drive a single, reusable UI.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { notify } from "@/src/shared/frontend/notify";
import { useContextRouter as useRouter } from "@/src/shared/frontend/hooks/use-url-context";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import {
    parseRateStr,
    roundRateValue,
} from "@/src/modules/inventory/frontend/components/bcv-rate-input";
import { emptyLineAdjustments } from "@/src/modules/inventory/shared/totals";
import { useDebouncedAutoSave } from "@/src/shared/frontend/hooks/use-debounced-autosave";
import type { MovementType } from "@/src/modules/inventory/backend/domain/movement";
import type { Product } from "@/src/modules/inventory/backend/domain/product";
import type {
    MovementDraftRow,
    MovementDraftSaveInput,
    MovementDraftKind,
    MovementDraftDirection,
} from "@/src/modules/inventory/backend/domain/movement-draft";

import type {
    ContextFieldKind,
    DirectionOption,
    IvaMode,
    OperationConfig,
    OperationItem,
} from "./operation-types";
import { useBcvAutoFetch } from "./use-bcv-fetch";
import { computeOperationRowCosts } from "./compute-costs";

const fmtN = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function emptyItem(): OperationItem {
    return {
        productId: "",
        productName: "",
        quantity: 1,
        currency: "B",
        currencyCost: 0,
        vatRate: 0,
        adjustments: emptyLineAdjustments(),
    };
}

function emptyContext(): Record<ContextFieldKind, string> {
    return { motivo: "", referencia: "", destino: "", notas: "" };
}

export interface ResolvedDirection {
    type: MovementType;
    isOutbound: boolean;
    defaultReference: string;
    description: string;
    footerNote?: string;
}

export function useOperationForm(config: OperationConfig) {
    const { companyId } = useCompany();
    const router = useRouter();
    const searchParams = useSearchParams();
    const draftIdParam = searchParams.get("draft");
    const {
        products, loadProducts,
        saveMovementDraft, confirmMovementDraft,
        getLatestMovementDraft, getMovementDraft, discardMovementDraft,
    } = useInventory();

    const draftKind: MovementDraftKind = config.kind;

    const [date, setDate] = useState(getTodayIsoDate());
    const [ivaMode, setIvaMode] = useState<IvaMode>("agregado");
    const [items, setItems] = useState<OperationItem[]>([emptyItem()]);
    const [context, setContext] = useState<Record<ContextFieldKind, string>>(emptyContext());
    const [selectedDirection, setSelectedDirection] = useState<DirectionOption | null>(
        config.directionOptions ? config.directionOptions[0] : null,
    );
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [savedPeriod, setSavedPeriod] = useState<string | null>(null);

    // Draft + confirm dialog state
    const [draftGroupId, setDraftGroupId] = useState<string | null>(null);
    const [draftLoaded, setDraftLoaded]   = useState(false);
    const [showConfirm, setShowConfirm]   = useState(false);
    const [confirming, setConfirming]     = useState(false);
    const [pendingDraft, setPendingDraft] = useState<{ id: string; updatedAt: string; count: number } | null>(null);
    const [resuming, setResuming]   = useState(false);
    const [discarding, setDiscarding] = useState(false);

    const bcv = useBcvAutoFetch(date);
    const dollarRate = useMemo<number | null>(() => {
        const r = parseRateStr(bcv.rate);
        return isFinite(r) ? roundRateValue(r, bcv.decimals) : null;
    }, [bcv.rate, bcv.decimals]);

    useEffect(() => {
        if (companyId) loadProducts(companyId);
    }, [companyId, loadProducts]);

    const resolvedDirection: ResolvedDirection = useMemo(() => {
        if (config.fixedDirection) {
            return {
                type: config.fixedDirection.value,
                isOutbound: config.fixedDirection.isOutbound,
                defaultReference: config.fixedDirection.defaultReference,
                description: config.fixedDirection.description,
                footerNote: config.fixedDirection.footerNote,
            };
        }
        const dir = selectedDirection ?? config.directionOptions![0];
        return {
            type: dir.value,
            isOutbound: dir.isOutbound,
            defaultReference: dir.defaultReference,
            description: dir.description,
            footerNote: dir.footerNote,
        };
    }, [config, selectedDirection]);

    const updateItem = useCallback((index: number, patch: Partial<OperationItem>) => {
        setItems((prev) => prev.map((it, i) => (i !== index ? it : { ...it, ...patch })));
    }, []);

    const addRow = useCallback(() => setItems((prev) => [...prev, emptyItem()]), []);
    const removeRow = useCallback((index: number) => {
        setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
    }, []);

    const setContextField = useCallback((kind: ContextFieldKind, value: string) => {
        setContext((prev) => ({ ...prev, [kind]: value }));
    }, []);

    function getProduct(id: string): Product | undefined {
        return products.find((p) => p.id === id);
    }

    function validate(): boolean {
        if (!companyId) { notify.error("Sin empresa seleccionada"); return false; }
        const ctxError = config.validateContext(context);
        if (ctxError) { notify.error(ctxError); return false; }
        if (items.length === 0) { notify.error("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productId) { notify.error("Selecciona un producto en cada fila"); return false; }
            if (item.quantity <= 0) { notify.error("La cantidad debe ser mayor a 0"); return false; }
            if (item.currencyCost < 0) { notify.error("El costo no puede ser negativo"); return false; }
            if (item.currency === "D" && !dollarRate) {
                notify.error("No hay tasa BCV disponible para esta fecha. Cambia la fecha o usa Bs.");
                return false;
            }
            if (resolvedDirection.isOutbound) {
                const prod = getProduct(item.productId);
                if (prod && item.quantity > prod.currentStock) {
                    notify.error(`Stock insuficiente para "${prod.name}": disponible ${fmtN(prod.currentStock)}`);
                    return false;
                }
            }
        }
        return true;
    }

    // ── Resume-draft banner ─────────────────────────────────────────────────
    // Visibility derived in render so the effect never has to clear state on
    // bail-out (avoids react-hooks/set-state-in-effect cascading renders).
    const shouldOfferResumeDraft = !!companyId && !draftIdParam && !saved && !draftGroupId && !draftLoaded;
    useEffect(() => {
        if (!shouldOfferResumeDraft || !companyId) return;
        let cancelled = false;
        getLatestMovementDraft(companyId, draftKind).then((summary) => {
            if (cancelled) return;
            if (!summary) { setPendingDraft(null); return; }
            setPendingDraft({
                id:        summary.draftGroupId,
                updatedAt: summary.updatedAt,
                count:     summary.count,
            });
        });
        return () => { cancelled = true; };
    }, [shouldOfferResumeDraft, companyId, draftKind, getLatestMovementDraft]);
    const visibleDraft = shouldOfferResumeDraft ? pendingDraft : null;

    // ── Load draft from `?draft=<id>` ───────────────────────────────────────
    useEffect(() => {
        if (!draftIdParam || !companyId || draftLoaded) return;
        let cancelled = false;
        getMovementDraft(companyId, draftIdParam).then((group) => {
            if (cancelled || !group) return;
            const meta = group.meta;
            setDate(meta.fecha ?? getTodayIsoDate());
            setIvaMode(meta.ivaMode ?? "agregado");
            const ctx = (meta.context as Record<string, string> | undefined) ?? {};
            setContext({
                motivo:     ctx.motivo     ?? "",
                referencia: ctx.referencia ?? "",
                destino:    ctx.destino    ?? "",
                notas:      ctx.notas      ?? "",
            });
            // Restore direction from the first item's tipo if it matches an option.
            if (config.directionOptions && group.items.length > 0) {
                const firstTipo = group.items[0].tipo;
                const matchedDir = config.directionOptions.find((o) => o.value === firstTipo);
                if (matchedDir) setSelectedDirection(matchedDir);
            }
            const restored: OperationItem[] = group.items.map((row) => {
                const product = products.find((p) => p.id === row.productId);
                const vatRate = product?.vatType === "general" ? 0.16 : 0;
                return {
                    productId:    row.productId,
                    productName:  product?.name ?? "",
                    quantity:     row.cantidad,
                    currency:     row.moneda,
                    currencyCost: row.costoMoneda ?? row.costoUnitario ?? 0,
                    vatRate,
                    adjustments: {
                        descuentoTipo:  row.descuentoTipo  ?? null,
                        descuentoValor: row.descuentoValor ?? 0,
                        recargoTipo:    row.recargoTipo    ?? null,
                        recargoValor:   row.recargoValor   ?? 0,
                    },
                };
            });
            if (restored.length > 0) setItems(restored);
            setDraftGroupId(meta.draftGroupId);
            setDraftLoaded(true);
        });
        return () => { cancelled = true; };
    }, [draftIdParam, companyId, draftLoaded, getMovementDraft, products, config.directionOptions]);

    // Build the draft rows the backend will persist.
    const buildDraftMovements = useCallback((): MovementDraftRow[] => {
        const meta = config.buildMovementMeta({
            directionDefaultReference: resolvedDirection.defaultReference,
            context,
        });
        return items
            .filter((it) => it.productId && it.quantity > 0)
            .map((item) => {
                const c = computeOperationRowCosts({
                    item, dollarRate, ivaMode,
                    enableLineAdjustments: config.enableLineAdjustments,
                });
                return {
                    productId:    item.productId,
                    tipo:         resolvedDirection.type,
                    fecha:        date,
                    cantidad:     item.quantity,
                    costoUnitario: c.unitCost,
                    moneda:       item.currency,
                    costoMoneda:  item.currencyCost,
                    tasaDolar:    item.currency === "D" ? dollarRate : null,
                    referencia:   meta.reference,
                    notas:        meta.notes,
                    ...(config.enableLineAdjustments && {
                        descuentoTipo:  item.adjustments.descuentoTipo,
                        descuentoValor: item.adjustments.descuentoValor,
                        descuentoMonto: c.descuentoMonto,
                        recargoTipo:    item.adjustments.recargoTipo,
                        recargoValor:   item.adjustments.recargoValor,
                        recargoMonto:   c.recargoMonto,
                        baseIva:        c.baseIVA,
                    }),
                };
            });
    }, [items, dollarRate, ivaMode, date, context, resolvedDirection, config]);

    // ── Auto-save ───────────────────────────────────────────────────────────
    const direction: MovementDraftDirection = resolvedDirection.isOutbound ? "outbound" : "inbound";

    const autosavePayload = useMemo(() => ({
        date, ivaMode, dollarRate, direction,
        kind: draftKind,
        type: resolvedDirection.type,
        context,
        items: items.map((it) => ({
            p: it.productId, q: it.quantity, cur: it.currency, cc: it.currencyCost, v: it.vatRate,
            dt: it.adjustments.descuentoTipo, dv: it.adjustments.descuentoValor,
            rt: it.adjustments.recargoTipo,   rv: it.adjustments.recargoValor,
        })),
    }), [date, ivaMode, dollarRate, direction, draftKind, resolvedDirection.type, context, items]);

    const autosaveSave = useCallback(async () => {
        if (!companyId) return null;
        const payload: MovementDraftSaveInput = {
            companyId,
            draftGroupId: draftGroupId,
            kind:      draftKind,
            direction,
            ivaMode,
            context:   { ...context },
            movements: buildDraftMovements(),
        };
        const saved = await saveMovementDraft(payload);
        if (saved?.draftGroupId) setDraftGroupId(saved.draftGroupId);
        return saved?.draftGroupId ?? null;
    }, [companyId, draftGroupId, draftKind, direction, ivaMode, context, buildDraftMovements, saveMovementDraft]);

    const autosave = useDebouncedAutoSave({
        payload: autosavePayload,
        save: autosaveSave,
        isValid: () => Boolean(
            companyId &&
            items.some((it) => it.productId && it.quantity > 0) &&
            !items.some((it) => it.currency === "D" && !dollarRate),
        ),
        enabled: !saved,
        delayMs: 2000,
    });

    function handleOpenConfirm() {
        if (!validate()) return;
        setShowConfirm(true);
    }

    async function handleSave() {
        // Public alias for legacy callers — opens the confirm dialog.
        handleOpenConfirm();
    }

    async function handleConfirmOperation() {
        setConfirming(true);
        await autosave.flush();
        let groupId = draftGroupId;
        if (!groupId && companyId) {
            const payload: MovementDraftSaveInput = {
                companyId,
                draftGroupId: null,
                kind:      draftKind,
                direction,
                ivaMode,
                context:   { ...context },
                movements: buildDraftMovements(),
            };
            const justSaved = await saveMovementDraft(payload);
            if (!justSaved?.draftGroupId) { setConfirming(false); return; }
            groupId = justSaved.draftGroupId;
            setDraftGroupId(groupId);
        }
        if (!groupId || !companyId) { setConfirming(false); return; }
        const result = await confirmMovementDraft(companyId, groupId);
        setSaving(false);
        setConfirming(false);
        setShowConfirm(false);
        if (result) {
            setSavedPeriod(date.slice(0, 7));
            setSaved(true);
        }
    }

    function handleResumeDraft() {
        if (!pendingDraft) return;
        setResuming(true);
        router.replace(`/inventory/operations/new?op=${config.kind}&draft=${pendingDraft.id}`);
    }

    async function handleDiscardDraft() {
        if (!pendingDraft || !companyId) return;
        setDiscarding(true);
        const ok = await discardMovementDraft(companyId, pendingDraft.id);
        setDiscarding(false);
        if (ok) {
            setPendingDraft(null);
            notify.info("Borrador descartado");
        }
    }

    const totals = useMemo(() => {
        return items.reduce(
            (acc, item) => {
                const { totalCost, vatAmountTotal, totalWithVat } = computeOperationRowCosts({
                    item, dollarRate, ivaMode,
                    enableLineAdjustments: config.enableLineAdjustments,
                });
                return {
                    subtotal: acc.subtotal + totalCost,
                    iva: acc.iva + vatAmountTotal,
                    total: acc.total + totalWithVat,
                };
            },
            { subtotal: 0, iva: 0, total: 0 },
        );
    }, [items, dollarRate, ivaMode, config.enableLineAdjustments]);

    const hasIva = items.some((i) => i.vatRate > 0);
    const costLabel = ivaMode === "agregado" ? "Costo base" : "Costo c/IVA";

    return {
        companyId,
        products,
        getProduct,
        date, setDate,
        ivaMode, setIvaMode,
        items, updateItem, addRow, removeRow,
        context, setContextField,
        selectedDirection, setSelectedDirection,
        resolvedDirection,
        bcv,
        dollarRate,
        saving, saved, savedPeriod,
        totals, hasIva, costLabel,
        handleSave,

        // Drafts + confirm dialog
        autosave,
        showConfirm, setShowConfirm,
        confirming,
        handleOpenConfirm,
        handleConfirmOperation,
        pendingDraft: visibleDraft,
        resuming,
        discarding,
        handleResumeDraft,
        handleDiscardDraft,
    };
}
