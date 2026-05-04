'use client';

// Frontend hook: useInventory
// Owns inventory-only state — products, movements, departments, period
// closures, ledgers (purchase/sales/inventory), period and balance reports,
// ISLR Art. 177 product report, stock adjustments, and movement drafts.
//
// Suppliers + purchase invoices + retention exports moved to the Purchases
// module — see `src/modules/purchases/frontend/hooks/use-purchases.ts`.

import { useState, useCallback, useMemo } from 'react';
import type { Product } from '../../backend/domain/product';
import type { Movement } from '../../backend/domain/movement';
import type { PeriodClose } from '../../backend/domain/period-close';
import type { Department } from '../../backend/domain/department';
import type { PeriodReportRow } from '../../backend/domain/period-report';
import type { PurchaseLedgerRow } from '../../backend/domain/purchase-ledger';
import type { IslrProduct } from '../../backend/domain/islr-report';
import type { SalesLedgerRow } from '../../backend/domain/sales-ledger';
import type { InventoryLedgerRow } from '../../backend/domain/inventory-ledger';
import type { BalanceReportRow } from '../../backend/domain/balance-report';
import type {
    MovementDraftSaveInput,
    MovementDraftSaveResult,
    MovementDraftSummary,
    MovementDraftGroup,
    MovementDraftKind,
    MovementDraftConfirmResult,
} from '../../backend/domain/movement-draft';
import type {
    GenerateRandomSalesInput,
    RandomSalesPreview,
    RandomSalesPreviewLine,
} from '../../backend/app/generate-random-sales.use-case';
import type {
    GenerateStockAdjustmentInput,
    StockAdjustmentPreview,
    StockAdjustmentLine,
    AdjustmentBaseSource,
    AdjustmentMode,
} from '../../backend/app/generate-stock-adjustment.use-case';
import type {
    SaveStockAdjustmentInput,
    SaveStockAdjustmentOutput,
} from '../../backend/app/save-stock-adjustment.use-case';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';
import { notify } from '@/src/shared/frontend/notify';

export type {
    Product, Movement, PeriodClose, Department,
    PeriodReportRow, PurchaseLedgerRow, IslrProduct, SalesLedgerRow,
    InventoryLedgerRow, BalanceReportRow,
    GenerateRandomSalesInput, RandomSalesPreview, RandomSalesPreviewLine,
    GenerateStockAdjustmentInput, StockAdjustmentPreview, StockAdjustmentLine,
    AdjustmentBaseSource, AdjustmentMode,
    SaveStockAdjustmentInput, SaveStockAdjustmentOutput,
};
export type {
    MovementDraftSaveInput, MovementDraftSaveResult, MovementDraftSummary,
    MovementDraftGroup, MovementDraftKind, MovementDraftConfirmResult,
};

function reportError(fallback: string, e: unknown): void {
    notify.error(e instanceof Error ? e.message : fallback);
}

export function useInventory() {
    const [products, setProducts]               = useState<Product[]>([]);
    const [movements, setMovements]             = useState<Movement[]>([]);
    const [periodCloses, setPeriodCloses]       = useState<PeriodClose[]>([]);
    const [departments, setDepartments]         = useState<Department[]>([]);
    const [periodReport, setPeriodReport]       = useState<PeriodReportRow[]>([]);
    const [purchaseLedger, setPurchaseLedger]   = useState<PurchaseLedgerRow[]>([]);
    const [islrReport, setIslrReport]           = useState<IslrProduct[]>([]);
    const [salesLedger, setSalesLedger]         = useState<SalesLedgerRow[]>([]);
    const [inventoryLedger, setInventoryLedger] = useState<InventoryLedgerRow[]>([]);
    const [balanceReport, setBalanceReport]     = useState<BalanceReportRow[]>([]);

    const [loadingProducts, setLoadingProducts]               = useState(false);
    const [loadingMovements, setLoadingMovements]             = useState(false);
    const [loadingPeriodCloses, setLoadingPeriodCloses]       = useState(false);
    const [loadingDepartments, setLoadingDepartments]         = useState(false);
    const [loadingPeriodReport, setLoadingPeriodReport]       = useState(false);
    const [loadingPurchaseLedger, setLoadingPurchaseLedger]   = useState(false);
    const [loadingIslrReport, setLoadingIslrReport]           = useState(false);
    const [loadingSalesLedger, setLoadingSalesLedger]         = useState(false);
    const [loadingInventoryLedger, setLoadingInventoryLedger] = useState(false);
    const [loadingBalanceReport, setLoadingBalanceReport]     = useState(false);

    // ── Products ───────────────────────────────────────────────────────────────

    const loadProducts = useCallback(async (companyId: string) => {
        setLoadingProducts(true);
        try {
            const res = await apiFetch(`/api/inventory/products?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar productos'); return; }
            setProducts(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingProducts(false);
        }
    }, []);

    const saveProduct = useCallback(async (product: Product): Promise<Product | null> => {
        try {
            const res = await apiFetch('/api/inventory/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar producto'); return null; }
            const saved: Product = json.data;
            setProducts((prev) => {
                const idx = prev.findIndex((p) => p.id === saved.id);
                return idx >= 0
                    ? prev.map((p) => (p.id === saved.id ? saved : p))
                    : [...prev, saved];
            });
            return saved;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const deleteProduct = useCallback(async (id: string): Promise<{ ok: boolean; softDeleted?: boolean }> => {
        try {
            const res = await apiFetch(`/api/inventory/products/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al eliminar producto'); return { ok: false }; }
            const softDeleted = Boolean(json.data?.softDeleted);
            if (softDeleted) {
                setProducts((prev) =>
                    prev.map((p) => (p.id === id ? { ...p, active: false } : p))
                );
            } else {
                setProducts((prev) => prev.filter((p) => p.id !== id));
            }
            return { ok: true, softDeleted };
        } catch (e) {
            reportError('Error de red', e);
            return { ok: false };
        }
    }, []);

    // ── Movements ──────────────────────────────────────────────────────────────

    const loadMovements = useCallback(async (companyId: string, period?: string) => {
        setLoadingMovements(true);
        try {
            const params = new URLSearchParams({ companyId });
            if (period) params.set('period', period);
            const res = await apiFetch(`/api/inventory/movements?${params}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar movimientos'); return; }
            setMovements(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingMovements(false);
        }
    }, []);

    const deleteMovement = useCallback(async (id: string): Promise<boolean> => {
        try {
            const res = await apiFetch(`/api/inventory/movements/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al eliminar movimiento'); return false; }
            setMovements((prev) => prev.filter((m) => m.id !== id));
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    const updateMovementMeta = useCallback(async (
        id: string, date: string, reference: string, notes: string,
    ): Promise<Movement | null> => {
        try {
            const res = await apiFetch(`/api/inventory/movements/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, reference, notes }),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al actualizar movimiento'); return null; }
            const updated: Movement = json.data;
            setMovements((prev) => prev.map((m) => m.id === updated.id ? updated : m));
            return updated;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const saveMovement = useCallback(async (movement: Movement): Promise<Movement | null> => {
        try {
            const res = await apiFetch('/api/inventory/movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(movement),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar movimiento'); return null; }
            const saved: Movement = json.data;
            setMovements((prev) => [saved, ...prev]);
            setProducts((prev) =>
                prev.map((p) =>
                    p.id === saved.productId
                        ? { ...p, currentStock: saved.balanceQuantity }
                        : p
                )
            );
            return saved;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    // ── Period Closes ──────────────────────────────────────────────────────────

    const loadPeriodCloses = useCallback(async (companyId: string) => {
        setLoadingPeriodCloses(true);
        try {
            const res = await apiFetch(`/api/inventory/closings?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar cierres'); return; }
            setPeriodCloses(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingPeriodCloses(false);
        }
    }, []);

    const currentDollarRate = useMemo(
        () => periodCloses.find((c) => c.dollarRate != null)?.dollarRate ?? null,
        [periodCloses],
    );

    const savePeriodClose = useCallback(async (
        companyId: string,
        period: string,
        notes?: string,
        dollarRate?: number | null,
    ): Promise<boolean> => {
        try {
            const res = await apiFetch('/api/inventory/closings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId, period, notes: notes ?? '', dollarRate: dollarRate ?? null }),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cerrar período'); return false; }
            if (json.data) setPeriodCloses((prev) => [json.data, ...prev]);
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    // ── Departments ────────────────────────────────────────────────────────────

    const loadDepartments = useCallback(async (companyId: string) => {
        setLoadingDepartments(true);
        try {
            const res = await apiFetch(`/api/inventory/departments?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar departamentos'); return; }
            setDepartments(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingDepartments(false);
        }
    }, []);

    const saveDepartment = useCallback(async (department: Department): Promise<Department | null> => {
        try {
            const res = await apiFetch('/api/inventory/departments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(department),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar departamento'); return null; }
            const saved: Department = json.data;
            setDepartments((prev) => {
                const idx = prev.findIndex((d) => d.id === saved.id);
                return idx >= 0
                    ? prev.map((d) => (d.id === saved.id ? saved : d))
                    : [...prev, saved];
            });
            return saved;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const deleteDepartment = useCallback(async (id: string): Promise<boolean> => {
        try {
            const res = await apiFetch(`/api/inventory/departments/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al eliminar departamento'); return false; }
            setDepartments((prev) => prev.filter((d) => d.id !== id));
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    // ── Purchase Ledger ────────────────────────────────────────────────────────

    const loadPurchaseLedger = useCallback(async (companyId: string, period: string) => {
        setLoadingPurchaseLedger(true);
        try {
            const res = await apiFetch(
                `/api/inventory/purchase-ledger?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar libro de entradas'); return; }
            setPurchaseLedger(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingPurchaseLedger(false);
        }
    }, []);

    // ── ISLR Report (Art. 177) ────────────────────────────────────────────────

    const loadIslrReport = useCallback(async (companyId: string, period: string) => {
        setLoadingIslrReport(true);
        try {
            const res = await apiFetch(
                `/api/inventory/islr-report?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar reporte ISLR'); return; }
            setIslrReport(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingIslrReport(false);
        }
    }, []);

    // ── Sales Ledger + outbound ────────────────────────────────────────────────

    const loadSalesLedger = useCallback(async (companyId: string, period: string) => {
        setLoadingSalesLedger(true);
        try {
            const res = await apiFetch(
                `/api/inventory/sales-ledger?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar libro de salidas'); return; }
            setSalesLedger(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingSalesLedger(false);
        }
    }, []);

    const generateRandomSales = useCallback(async (
        input: GenerateRandomSalesInput,
    ): Promise<RandomSalesPreview | null> => {
        try {
            const res = await apiFetch('/api/inventory/sales/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al generar salidas'); return null; }
            return json.data as RandomSalesPreview;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const saveOutbound = useCallback(async (payload: {
        companyId: string;
        date: string;
        reference?: string;
        items: { productId: string; quantity: number; currentStock?: number; precioVentaUnitario?: number; date?: string; type?: 'salida' | 'autoconsumo' }[];
    }): Promise<boolean> => {
        try {
            const res = await apiFetch('/api/inventory/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al registrar salida'); return false; }
            const saved = json.data as Movement[];
            setProducts((prev) =>
                prev.map((p) => {
                    const lastMov = saved.filter((m) => m.productId === p.id).at(-1);
                    return lastMov ? { ...p, currentStock: lastMov.balanceQuantity } : p;
                })
            );
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    // ── Stock Adjustments ──────────────────────────────────────────────────────

    const generateStockAdjustment = useCallback(async (
        input: GenerateStockAdjustmentInput,
    ): Promise<StockAdjustmentPreview | null> => {
        try {
            const res = await apiFetch('/api/inventory/adjustments/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(input),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al generar ajuste'); return null; }
            return json.data as StockAdjustmentPreview;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const saveStockAdjustment = useCallback(async (
        payload: SaveStockAdjustmentInput,
    ): Promise<SaveStockAdjustmentOutput | null> => {
        try {
            const res = await apiFetch('/api/inventory/adjustments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar ajuste'); return null; }
            const data = json.data as SaveStockAdjustmentOutput;
            if (data.updated.length > 0) {
                const byId = new Map(data.updated.map((p) => [p.id, p]));
                setProducts((prev) =>
                    prev.map((p) => (p.id && byId.has(p.id) ? byId.get(p.id)! : p))
                );
            }
            return data;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    // ── Inventory Ledger ───────────────────────────────────────────────────────

    const loadInventoryLedger = useCallback(async (companyId: string, year: number) => {
        setLoadingInventoryLedger(true);
        try {
            const res = await apiFetch(
                `/api/inventory/inventory-ledger?companyId=${encodeURIComponent(companyId)}&year=${year}`
            );
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar libro de inventarios'); return; }
            setInventoryLedger(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingInventoryLedger(false);
        }
    }, []);

    // ── Balance Report ─────────────────────────────────────────────────────────

    const loadBalanceReport = useCallback(async (companyId: string, period: string) => {
        setLoadingBalanceReport(true);
        try {
            const res = await apiFetch(
                `/api/inventory/balance-report?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar reporte SALDO'); return; }
            setBalanceReport(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingBalanceReport(false);
        }
    }, []);

    // ── Period Report ──────────────────────────────────────────────────────────

    const loadPeriodReport = useCallback(async (companyId: string, period: string) => {
        setLoadingPeriodReport(true);
        try {
            const res = await apiFetch(
                `/api/inventory/report?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar reporte'); return; }
            setPeriodReport(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingPeriodReport(false);
        }
    }, []);

    // ── Movement drafts ────────────────────────────────────────────────────────

    const saveMovementDraft = useCallback(async (
        input: MovementDraftSaveInput,
    ): Promise<MovementDraftSaveResult | null> => {
        try {
            const res  = await apiFetch('/api/inventory/movements/draft', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(input),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar borrador'); return null; }
            return json.data ?? null;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const confirmMovementDraft = useCallback(async (
        companyId:    string,
        draftGroupId: string,
    ): Promise<MovementDraftConfirmResult | null> => {
        try {
            const res  = await apiFetch(`/api/inventory/movements/draft/${encodeURIComponent(draftGroupId)}/confirm`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ companyId }),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al confirmar borrador'); return null; }
            return json.data ?? null;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const getLatestMovementDraft = useCallback(async (
        companyId: string,
        kind:      MovementDraftKind,
    ): Promise<MovementDraftSummary | null> => {
        try {
            const url  = `/api/inventory/movements/draft?companyId=${encodeURIComponent(companyId)}&kind=${encodeURIComponent(kind)}`;
            const res  = await apiFetch(url);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al consultar borrador'); return null; }
            return (json.data ?? null) as MovementDraftSummary | null;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const getMovementDraft = useCallback(async (
        companyId:    string,
        draftGroupId: string,
    ): Promise<MovementDraftGroup | null> => {
        try {
            const url  = `/api/inventory/movements/draft?companyId=${encodeURIComponent(companyId)}&draftGroupId=${encodeURIComponent(draftGroupId)}`;
            const res  = await apiFetch(url);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar borrador'); return null; }
            return (json.data ?? null) as MovementDraftGroup | null;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const discardMovementDraft = useCallback(async (
        companyId:    string,
        draftGroupId: string,
    ): Promise<boolean> => {
        try {
            const url  = `/api/inventory/movements/draft?companyId=${encodeURIComponent(companyId)}&draftGroupId=${encodeURIComponent(draftGroupId)}`;
            const res  = await apiFetch(url, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al descartar borrador'); return false; }
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    return {
        // state
        products, movements, periodCloses,
        departments, periodReport, purchaseLedger, islrReport, salesLedger,
        inventoryLedger, balanceReport,
        currentDollarRate,
        // loading
        loadingProducts, loadingMovements,
        loadingPeriodCloses,
        loadingDepartments, loadingPeriodReport, loadingPurchaseLedger,
        loadingIslrReport, loadingSalesLedger, loadingInventoryLedger,
        loadingBalanceReport,
        // actions
        loadProducts, saveProduct, deleteProduct,
        loadMovements, saveMovement, deleteMovement, updateMovementMeta,
        loadPeriodCloses, savePeriodClose,
        loadDepartments, saveDepartment, deleteDepartment,
        loadPeriodReport,
        loadPurchaseLedger,
        loadIslrReport,
        loadSalesLedger, saveOutbound, generateRandomSales,
        generateStockAdjustment, saveStockAdjustment,
        loadInventoryLedger,
        loadBalanceReport,
        // movement drafts
        saveMovementDraft, confirmMovementDraft, getLatestMovementDraft,
        getMovementDraft, discardMovementDraft,
    };
}
