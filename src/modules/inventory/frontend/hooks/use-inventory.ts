'use client';

// Frontend hook: useInventory
// Provides all inventory state and async actions for the inventory module.
// Architectural role: application-layer adapter between UI components and inventory API routes.
// Errors are surfaced via notify.error (toast) — never returned to callers as a state slice.

import { useState, useCallback, useMemo } from 'react';
import type { Product } from '../../backend/domain/product';
import type { Movement } from '../../backend/domain/movement';
import type { PeriodClose } from '../../backend/domain/period-close';
import type { Supplier } from '../../backend/domain/supplier';
import type { PurchaseInvoice, PurchaseInvoiceItem } from '../../backend/domain/purchase-invoice';
import type { Department } from '../../backend/domain/department';
import type { PeriodReportRow } from '../../backend/domain/period-report';
import type { PurchaseLedgerRow } from '../../backend/domain/purchase-ledger';
import type { IslrProduct } from '../../backend/domain/islr-report';
import type { SalesLedgerRow } from '../../backend/domain/sales-ledger';
import type { InventoryLedgerRow } from '../../backend/domain/inventory-ledger';
import type { BalanceReportRow } from '../../backend/domain/balance-report';
import type {
    GenerateRandomSalesInput,
    RandomSalesPreview,
    RandomSalesPreviewLine,
} from '../../backend/app/generate-random-sales.use-case';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';
import { notify } from '@/src/shared/frontend/notify';

export type { Product, Movement, PeriodClose, Supplier, PurchaseInvoice, PurchaseInvoiceItem, Department, PeriodReportRow, PurchaseLedgerRow, IslrProduct, SalesLedgerRow, InventoryLedgerRow, BalanceReportRow, GenerateRandomSalesInput, RandomSalesPreview, RandomSalesPreviewLine };

// Centralised error reporter. Network failures go to console for debugging
// but the user always sees a toast — never a silent failure.
function reportError(fallback: string, e: unknown): void {
    notify.error(e instanceof Error ? e.message : fallback);
}

export function useInventory() {
    const [products, setProducts]                       = useState<Product[]>([]);
    const [movements, setMovements]                     = useState<Movement[]>([]);
    const [periodCloses, setPeriodCloses]               = useState<PeriodClose[]>([]);
    const [suppliers, setSuppliers]                     = useState<Supplier[]>([]);
    const [purchaseInvoices, setPurchaseInvoices]       = useState<PurchaseInvoice[]>([]);
    const [currentPurchaseInvoice, setCurrentPurchaseInvoice] = useState<PurchaseInvoice | null>(null);
    const [departments, setDepartments]                 = useState<Department[]>([]);
    const [periodReport, setPeriodReport]               = useState<PeriodReportRow[]>([]);
    const [purchaseLedger, setPurchaseLedger]           = useState<PurchaseLedgerRow[]>([]);
    const [islrReport, setIslrReport]                   = useState<IslrProduct[]>([]);
    const [salesLedger, setSalesLedger]                 = useState<SalesLedgerRow[]>([]);
    const [inventoryLedger, setInventoryLedger]         = useState<InventoryLedgerRow[]>([]);
    const [balanceReport, setBalanceReport]             = useState<BalanceReportRow[]>([]);

    const [loadingProducts, setLoadingProducts]               = useState(false);
    const [loadingMovements, setLoadingMovements]             = useState(false);
    const [loadingPeriodCloses, setLoadingPeriodCloses]       = useState(false);
    const [loadingSuppliers, setLoadingSuppliers]             = useState(false);
    const [loadingPurchaseInvoices, setLoadingPurchaseInvoices] = useState(false);
    const [loadingPurchaseInvoice, setLoadingPurchaseInvoice] = useState(false);
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

    // Derived: dollar rate from most recent period close that has one set.
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

    // ── Suppliers ──────────────────────────────────────────────────────────────

    const loadSuppliers = useCallback(async (companyId: string) => {
        setLoadingSuppliers(true);
        try {
            const res = await apiFetch(`/api/inventory/suppliers?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar proveedores'); return; }
            setSuppliers(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingSuppliers(false);
        }
    }, []);

    const saveSupplier = useCallback(async (supplier: Supplier): Promise<Supplier | null> => {
        try {
            const res = await apiFetch('/api/inventory/suppliers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(supplier),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar proveedor'); return null; }
            const saved: Supplier = json.data;
            setSuppliers((prev) => {
                const idx = prev.findIndex((s) => s.id === saved.id);
                return idx >= 0
                    ? prev.map((s) => (s.id === saved.id ? saved : s))
                    : [...prev, saved];
            });
            return saved;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const deleteSupplier = useCallback(async (id: string): Promise<boolean> => {
        try {
            const res = await apiFetch(`/api/inventory/suppliers/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al eliminar proveedor'); return false; }
            setSuppliers((prev) => prev.filter((s) => s.id !== id));
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    // ── Purchase Invoices ──────────────────────────────────────────────────────

    const loadPurchaseInvoices = useCallback(async (companyId: string) => {
        setLoadingPurchaseInvoices(true);
        try {
            const res = await apiFetch(`/api/inventory/purchases?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar facturas'); return; }
            setPurchaseInvoices(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingPurchaseInvoices(false);
        }
    }, []);

    const loadPurchaseInvoice = useCallback(async (invoiceId: string) => {
        setLoadingPurchaseInvoice(true);
        try {
            const res = await apiFetch(`/api/inventory/purchases/${encodeURIComponent(invoiceId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar factura'); return; }
            setCurrentPurchaseInvoice(json.data ?? null);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingPurchaseInvoice(false);
        }
    }, []);

    const savePurchaseInvoice = useCallback(async (
        invoice: PurchaseInvoice,
        items: PurchaseInvoiceItem[],
    ): Promise<PurchaseInvoice | null> => {
        try {
            const url = invoice.id
                ? `/api/inventory/purchases/${invoice.id}`
                : '/api/inventory/purchases';
            const res = await apiFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice, items }),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar factura'); return null; }
            const saved: PurchaseInvoice = json.data;
            setPurchaseInvoices((prev) => {
                const idx = prev.findIndex((f) => f.id === saved.id);
                return idx >= 0
                    ? prev.map((f) => (f.id === saved.id ? saved : f))
                    : [saved, ...prev];
            });
            setCurrentPurchaseInvoice(saved);
            return saved;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const deletePurchaseInvoice = useCallback(async (invoiceId: string): Promise<boolean> => {
        try {
            const res = await apiFetch(`/api/inventory/purchases/${invoiceId}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al eliminar factura'); return false; }
            setPurchaseInvoices((prev) => prev.filter((f) => f.id !== invoiceId));
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    // After (un)confirming, the RPC returns only the header (row_to_json of
    // facturas_compra). To keep `currentPurchaseInvoice.items` populated for
    // the detail page's breakdown, refetch the full invoice with items.
    const refetchFullInvoice = useCallback(async (invoiceId: string): Promise<PurchaseInvoice | null> => {
        try {
            const res = await apiFetch(`/api/inventory/purchases/${encodeURIComponent(invoiceId)}`);
            const json = await res.json();
            if (!res.ok) return null;
            return json.data ?? null;
        } catch {
            return null;
        }
    }, []);

    const confirmPurchaseInvoice = useCallback(async (invoiceId: string): Promise<PurchaseInvoice | null> => {
        try {
            const res = await apiFetch(`/api/inventory/purchases/${invoiceId}/confirm`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al confirmar factura'); return null; }
            const headerOnly: PurchaseInvoice = json.data;
            const full = (await refetchFullInvoice(headerOnly.id!)) ?? headerOnly;
            setPurchaseInvoices((prev) => prev.map((f) => (f.id === full.id ? full : f)));
            setCurrentPurchaseInvoice(full);
            return full;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, [refetchFullInvoice]);

    const unconfirmPurchaseInvoice = useCallback(async (invoiceId: string): Promise<PurchaseInvoice | null> => {
        try {
            const res = await apiFetch(`/api/inventory/purchases/${invoiceId}/unconfirm`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al desconfirmar factura'); return null; }
            const headerOnly: PurchaseInvoice = json.data;
            const full = (await refetchFullInvoice(headerOnly.id!)) ?? headerOnly;
            setPurchaseInvoices((prev) => prev.map((f) => (f.id === full.id ? full : f)));
            setCurrentPurchaseInvoice(full);
            return full;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, [refetchFullInvoice]);

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

    // ── ISLR Report ────────────────────────────────────────────────────────────

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

    // ── Sales Ledger ───────────────────────────────────────────────────────────

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

    return {
        // state
        products, movements, periodCloses,
        suppliers, purchaseInvoices, currentPurchaseInvoice,
        departments, periodReport, purchaseLedger, islrReport, salesLedger, inventoryLedger, balanceReport,
        currentDollarRate,
        // loading
        loadingProducts, loadingMovements,
        loadingPeriodCloses,
        loadingSuppliers, loadingPurchaseInvoices, loadingPurchaseInvoice,
        loadingDepartments, loadingPeriodReport, loadingPurchaseLedger, loadingIslrReport, loadingSalesLedger, loadingInventoryLedger, loadingBalanceReport,
        // actions
        loadProducts, saveProduct, deleteProduct,
        loadMovements, saveMovement, deleteMovement, updateMovementMeta,
        loadPeriodCloses, savePeriodClose,
        loadSuppliers, saveSupplier, deleteSupplier,
        loadPurchaseInvoices, loadPurchaseInvoice, savePurchaseInvoice, confirmPurchaseInvoice, unconfirmPurchaseInvoice, deletePurchaseInvoice,
        loadDepartments, saveDepartment, deleteDepartment,
        loadPeriodReport,
        loadPurchaseLedger,
        loadIslrReport,
        loadSalesLedger, saveOutbound, generateRandomSales,
        loadInventoryLedger,
        loadBalanceReport,
    };
}
