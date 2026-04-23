'use client';

// Frontend hook: useInventory
// Provides all inventory state and async actions for the inventory module.
// Architectural role: application-layer adapter between UI components and inventory API routes.
// All state variables, loading flags, and functions use English identifiers aligned with English domain types.

import { useState, useCallback, useMemo } from 'react';
import type { Product } from '../../backend/domain/product';
import type { Movement, KardexEntry } from '../../backend/domain/movement';
import type { Transformation, PeriodClose } from '../../backend/domain/transformation';
import type { Supplier } from '../../backend/domain/supplier';
import type { PurchaseInvoice, PurchaseInvoiceItem } from '../../backend/domain/purchase-invoice';
import type { Department } from '../../backend/domain/department';
import type { PeriodReportRow } from '../../backend/domain/period-report';
import type { PurchaseLedgerRow } from '../../backend/domain/purchase-ledger';
import type { IslrProduct } from '../../backend/domain/islr-report';
import type { SalesLedgerRow } from '../../backend/domain/sales-ledger';
import type { InventoryLedgerRow } from '../../backend/domain/inventory-ledger';
import type { BalanceReportRow } from '../../backend/domain/balance-report';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';

export type { Product, Movement, KardexEntry, Transformation, PeriodClose, Supplier, PurchaseInvoice, PurchaseInvoiceItem, Department, PeriodReportRow, PurchaseLedgerRow, IslrProduct, SalesLedgerRow, InventoryLedgerRow, BalanceReportRow };

export function useInventory() {
    const [products, setProducts]                       = useState<Product[]>([]);
    const [movements, setMovements]                     = useState<Movement[]>([]);
    const [kardex, setKardex]                           = useState<KardexEntry[]>([]);
    const [transformations, setTransformations]         = useState<Transformation[]>([]);
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
    const [loadingKardex, setLoadingKardex]                   = useState(false);
    const [loadingTransformations, setLoadingTransformations] = useState(false);
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

    const [error, setError] = useState<string | null>(null);

    // ── Products ───────────────────────────────────────────────────────────────

    const loadProducts = useCallback(async (companyId: string) => {
        setLoadingProducts(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/products?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar productos'); return; }
            setProducts(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingProducts(false);
        }
    }, []);

    const saveProduct = useCallback(async (product: Product): Promise<Product | null> => {
        setError(null);
        try {
            const res = await apiFetch('/api/inventory/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(product),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar producto'); return null; }
            const saved: Product = json.data;
            setProducts((prev) => {
                const idx = prev.findIndex((p) => p.id === saved.id);
                return idx >= 0
                    ? prev.map((p) => (p.id === saved.id ? saved : p))
                    : [...prev, saved];
            });
            return saved;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    const deleteProduct = useCallback(async (id: string): Promise<{ ok: boolean; softDeleted?: boolean }> => {
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/products/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar producto'); return { ok: false }; }
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
            setError(e instanceof Error ? e.message : 'Error de red');
            return { ok: false };
        }
    }, []);

    // ── Movements ──────────────────────────────────────────────────────────────

    const loadMovements = useCallback(async (companyId: string, period?: string) => {
        setLoadingMovements(true);
        setError(null);
        try {
            const params = new URLSearchParams({ companyId });
            if (period) params.set('period', period);
            const res = await apiFetch(`/api/inventory/movements?${params}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar movimientos'); return; }
            setMovements(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingMovements(false);
        }
    }, []);

    const deleteMovement = useCallback(async (id: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/movements/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar movimiento'); return false; }
            setMovements((prev) => prev.filter((m) => m.id !== id));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    const updateMovementMeta = useCallback(async (
        id: string, date: string, reference: string, notes: string,
    ): Promise<Movement | null> => {
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/movements/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, reference, notes }),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al actualizar movimiento'); return null; }
            const updated: Movement = json.data;
            setMovements((prev) => prev.map((m) => m.id === updated.id ? updated : m));
            return updated;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    const saveMovement = useCallback(async (movement: Movement): Promise<Movement | null> => {
        setError(null);
        try {
            const res = await apiFetch('/api/inventory/movements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(movement),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar movimiento'); return null; }
            const saved: Movement = json.data;
            setMovements((prev) => [saved, ...prev]);
            // Update product current stock from saved movement balance
            setProducts((prev) =>
                prev.map((p) =>
                    p.id === saved.productId
                        ? { ...p, currentStock: saved.balanceQuantity }
                        : p
                )
            );
            return saved;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    // ── Kardex ─────────────────────────────────────────────────────────────────

    const loadKardex = useCallback(async (companyId: string, productId: string) => {
        setLoadingKardex(true);
        setError(null);
        try {
            const res = await apiFetch(
                `/api/inventory/kardex?companyId=${encodeURIComponent(companyId)}&productId=${encodeURIComponent(productId)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar kardex'); return; }
            setKardex(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingKardex(false);
        }
    }, []);

    // ── Transformations ────────────────────────────────────────────────────────

    const loadTransformations = useCallback(async (companyId: string) => {
        setLoadingTransformations(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/transformations?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar transformaciones'); return; }
            setTransformations(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingTransformations(false);
        }
    }, []);

    const saveTransformation = useCallback(async (transformation: Transformation): Promise<Transformation | null> => {
        setError(null);
        try {
            const res = await apiFetch('/api/inventory/transformations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transformation),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar transformación'); return null; }
            const saved: Transformation = json.data;
            setTransformations((prev) => [saved, ...prev]);
            return saved;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    // ── Period Closes ──────────────────────────────────────────────────────────

    const loadPeriodCloses = useCallback(async (companyId: string) => {
        setLoadingPeriodCloses(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/closings?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar cierres'); return; }
            setPeriodCloses(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
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
        setError(null);
        try {
            const res = await apiFetch('/api/inventory/closings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId, period, notes: notes ?? '', dollarRate: dollarRate ?? null }),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cerrar período'); return false; }
            if (json.data) setPeriodCloses((prev) => [json.data, ...prev]);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Suppliers ──────────────────────────────────────────────────────────────

    const loadSuppliers = useCallback(async (companyId: string) => {
        setLoadingSuppliers(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/suppliers?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar proveedores'); return; }
            setSuppliers(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingSuppliers(false);
        }
    }, []);

    const saveSupplier = useCallback(async (supplier: Supplier): Promise<Supplier | null> => {
        setError(null);
        try {
            const res = await apiFetch('/api/inventory/suppliers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(supplier),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar proveedor'); return null; }
            const saved: Supplier = json.data;
            setSuppliers((prev) => {
                const idx = prev.findIndex((s) => s.id === saved.id);
                return idx >= 0
                    ? prev.map((s) => (s.id === saved.id ? saved : s))
                    : [...prev, saved];
            });
            return saved;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    const deleteSupplier = useCallback(async (id: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/suppliers/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar proveedor'); return false; }
            setSuppliers((prev) => prev.filter((s) => s.id !== id));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Purchase Invoices ──────────────────────────────────────────────────────

    const loadPurchaseInvoices = useCallback(async (companyId: string) => {
        setLoadingPurchaseInvoices(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/purchases?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar facturas'); return; }
            setPurchaseInvoices(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingPurchaseInvoices(false);
        }
    }, []);

    const loadPurchaseInvoice = useCallback(async (invoiceId: string) => {
        setLoadingPurchaseInvoice(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/purchases/${encodeURIComponent(invoiceId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar factura'); return; }
            setCurrentPurchaseInvoice(json.data ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingPurchaseInvoice(false);
        }
    }, []);

    const savePurchaseInvoice = useCallback(async (
        invoice: PurchaseInvoice,
        items: PurchaseInvoiceItem[],
    ): Promise<PurchaseInvoice | null> => {
        setError(null);
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
            if (!res.ok) { setError(json.error ?? 'Error al guardar factura'); return null; }
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
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    const deletePurchaseInvoice = useCallback(async (invoiceId: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/purchases/${invoiceId}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar factura'); return false; }
            setPurchaseInvoices((prev) => prev.filter((f) => f.id !== invoiceId));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    const confirmPurchaseInvoice = useCallback(async (invoiceId: string): Promise<PurchaseInvoice | null> => {
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/purchases/${invoiceId}/confirm`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al confirm factura'); return null; }
            const confirmed: PurchaseInvoice = json.data;
            setPurchaseInvoices((prev) => prev.map((f) => (f.id === confirmed.id ? confirmed : f)));
            setCurrentPurchaseInvoice(confirmed);
            return confirmed;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    // ── Departments ────────────────────────────────────────────────────────────

    const loadDepartments = useCallback(async (companyId: string) => {
        setLoadingDepartments(true);
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/departments?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar departamentos'); return; }
            setDepartments(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingDepartments(false);
        }
    }, []);

    const saveDepartment = useCallback(async (department: Department): Promise<Department | null> => {
        setError(null);
        try {
            const res = await apiFetch('/api/inventory/departments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(department),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar departamento'); return null; }
            const saved: Department = json.data;
            setDepartments((prev) => {
                const idx = prev.findIndex((d) => d.id === saved.id);
                return idx >= 0
                    ? prev.map((d) => (d.id === saved.id ? saved : d))
                    : [...prev, saved];
            });
            return saved;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    const deleteDepartment = useCallback(async (id: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await apiFetch(`/api/inventory/departments/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar departamento'); return false; }
            setDepartments((prev) => prev.filter((d) => d.id !== id));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Purchase Ledger ────────────────────────────────────────────────────────

    const loadPurchaseLedger = useCallback(async (companyId: string, period: string) => {
        setLoadingPurchaseLedger(true);
        setError(null);
        try {
            const res = await apiFetch(
                `/api/inventory/purchase-ledger?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar libro de entradas'); return; }
            setPurchaseLedger(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingPurchaseLedger(false);
        }
    }, []);

    // ── ISLR Report ────────────────────────────────────────────────────────────

    const loadIslrReport = useCallback(async (companyId: string, period: string) => {
        setLoadingIslrReport(true);
        setError(null);
        try {
            const res = await apiFetch(
                `/api/inventory/islr-report?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar reporte ISLR'); return; }
            setIslrReport(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingIslrReport(false);
        }
    }, []);

    // ── Sales Ledger ───────────────────────────────────────────────────────────

    const loadSalesLedger = useCallback(async (companyId: string, period: string) => {
        setLoadingSalesLedger(true);
        setError(null);
        try {
            const res = await apiFetch(
                `/api/inventory/sales-ledger?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar libro de salidas'); return; }
            setSalesLedger(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingSalesLedger(false);
        }
    }, []);

    const saveOutbound = useCallback(async (payload: {
        companyId: string;
        date: string;
        reference?: string;
        items: { productId: string; quantity: number; currentStock?: number }[];
    }): Promise<boolean> => {
        setError(null);
        try {
            const res = await apiFetch('/api/inventory/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al registrar salida'); return false; }
            const saved = json.data as Movement[];
            // Update product current stock from the last outbound movement per product
            setProducts((prev) =>
                prev.map((p) => {
                    const lastMov = saved.filter((m) => m.productId === p.id).at(-1);
                    return lastMov ? { ...p, currentStock: lastMov.balanceQuantity } : p;
                })
            );
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Inventory Ledger ───────────────────────────────────────────────────────

    const loadInventoryLedger = useCallback(async (companyId: string, year: number) => {
        setLoadingInventoryLedger(true);
        setError(null);
        try {
            const res = await apiFetch(
                `/api/inventory/inventory-ledger?companyId=${encodeURIComponent(companyId)}&year=${year}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar libro de inventarios'); return; }
            setInventoryLedger(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingInventoryLedger(false);
        }
    }, []);

    // ── Balance Report ─────────────────────────────────────────────────────────

    const loadBalanceReport = useCallback(async (companyId: string, period: string) => {
        setLoadingBalanceReport(true);
        setError(null);
        try {
            const res = await apiFetch(
                `/api/inventory/balance-report?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar reporte SALDO'); return; }
            setBalanceReport(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingBalanceReport(false);
        }
    }, []);

    // ── Period Report ──────────────────────────────────────────────────────────

    const loadPeriodReport = useCallback(async (companyId: string, period: string) => {
        setLoadingPeriodReport(true);
        setError(null);
        try {
            const res = await apiFetch(
                `/api/inventory/report?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar reporte'); return; }
            setPeriodReport(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingPeriodReport(false);
        }
    }, []);

    return {
        // state
        products, movements, kardex, transformations, periodCloses,
        suppliers, purchaseInvoices, currentPurchaseInvoice,
        departments, periodReport, purchaseLedger, islrReport, salesLedger, inventoryLedger, balanceReport,
        currentDollarRate,
        // loading
        loadingProducts, loadingMovements, loadingKardex,
        loadingTransformations, loadingPeriodCloses,
        loadingSuppliers, loadingPurchaseInvoices, loadingPurchaseInvoice,
        loadingDepartments, loadingPeriodReport, loadingPurchaseLedger, loadingIslrReport, loadingSalesLedger, loadingInventoryLedger, loadingBalanceReport,
        // error
        error, setError,
        // actions
        loadProducts, saveProduct, deleteProduct,
        loadMovements, saveMovement, deleteMovement, updateMovementMeta,
        loadKardex,
        loadTransformations, saveTransformation,
        loadPeriodCloses, savePeriodClose,
        loadSuppliers, saveSupplier, deleteSupplier,
        loadPurchaseInvoices, loadPurchaseInvoice, savePurchaseInvoice, confirmPurchaseInvoice, deletePurchaseInvoice,
        loadDepartments, saveDepartment, deleteDepartment,
        loadPeriodReport,
        loadPurchaseLedger,
        loadIslrReport,
        loadSalesLedger, saveOutbound,
        loadInventoryLedger,
        loadBalanceReport,
    };
}
