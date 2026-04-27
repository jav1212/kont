"use client";

// useOperationForm — owns all the duplicated state and handlers that lived in
// adjustments/returns/self-consumption pages. The orchestrator component
// (`OperationForm`) consumes this hook plus the declarative `OperationConfig` to
// drive a single, reusable UI.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import { getTodayIsoDate } from "@/src/shared/frontend/utils/local-date";
import {
    parseRateStr,
    roundRateValue,
} from "@/src/modules/inventory/frontend/components/bcv-rate-input";
import { emptyLineAdjustments } from "@/src/modules/inventory/shared/totals";
import type { Movement, MovementType } from "@/src/modules/inventory/backend/domain/movement";
import type { Product } from "@/src/modules/inventory/backend/domain/product";

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
    const { products, loadProducts, saveMovement, error, setError } = useInventory();

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
        if (!companyId) { setError("Sin empresa seleccionada"); return false; }
        const ctxError = config.validateContext(context);
        if (ctxError) { setError(ctxError); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.quantity <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
            if (item.currencyCost < 0) { setError("El costo no puede ser negativo"); return false; }
            if (item.currency === "D" && !dollarRate) {
                setError("No hay tasa BCV disponible para esta fecha. Cambia la fecha o usa Bs.");
                return false;
            }
            if (resolvedDirection.isOutbound) {
                const prod = getProduct(item.productId);
                if (prod && item.quantity > prod.currentStock) {
                    setError(`Stock insuficiente para "${prod.name}": disponible ${fmtN(prod.currentStock)}`);
                    return false;
                }
            }
        }
        return true;
    }

    async function handleSave() {
        if (!validate()) return;
        setSaving(true);
        setError(null);
        const meta = config.buildMovementMeta({
            directionDefaultReference: resolvedDirection.defaultReference,
            context,
        });
        let allOk = true;
        for (const item of items) {
            const c = computeOperationRowCosts({
                item, dollarRate, ivaMode,
                enableLineAdjustments: config.enableLineAdjustments,
            });
            const movement: Movement = {
                companyId: companyId!,
                productId: item.productId,
                type: resolvedDirection.type,
                date,
                period: date.slice(0, 7),
                quantity: item.quantity,
                unitCost: c.unitCost,
                totalCost: c.totalCost,
                balanceQuantity: 0,
                reference: meta.reference,
                notes: meta.notes,
                currency: item.currency,
                currencyCost: c.baseCurrencyCost,
                dollarRate: item.currency === "D" ? dollarRate : null,
                ...(config.enableLineAdjustments && {
                    descuentoTipo:  item.adjustments.descuentoTipo,
                    descuentoValor: item.adjustments.descuentoValor,
                    descuentoMonto: c.descuentoMonto,
                    recargoTipo:    item.adjustments.recargoTipo,
                    recargoValor:   item.adjustments.recargoValor,
                    recargoMonto:   c.recargoMonto,
                    baseIVA:        c.baseIVA,
                }),
            };
            const result = await saveMovement(movement);
            if (!result) { allOk = false; break; }
        }
        setSaving(false);
        if (allOk) {
            setSavedPeriod(date.slice(0, 7));
            setSaved(true);
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
        error, setError,
        totals, hasIva, costLabel,
        handleSave,
    };
}
