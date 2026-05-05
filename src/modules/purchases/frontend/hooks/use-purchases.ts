'use client';

// Frontend hook: usePurchases
// Owns state and async actions for the Purchases module — suppliers,
// purchase invoices, retention exports (TXT IVA / XML ISLR).
// Architectural role: application-layer adapter between UI components
// and `app/api/purchases/*` routes.
// Errors surface via notify.error toast — never returned as state.

import { useState, useCallback } from 'react';
import type { Supplier } from '../../backend/domain/supplier';
import type { PurchaseInvoice, PurchaseInvoiceItem } from '../../backend/domain/purchase-invoice';
import type { MigratePurchaseInvoicesResult } from '../../backend/domain/migrate-purchase-invoices';
import type { IvaRetentionExportRow } from '../../backend/domain/iva-retention-export';
import type { IvaRetentionExportPayload } from '../../backend/domain/repository/iva-retention-export.repository';
import type { IslrRetentionExportRow, IslrRetentionExportPayload } from '../../backend/domain/islr-retentions-export';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';
import { notify } from '@/src/shared/frontend/notify';

export type {
    Supplier,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    MigratePurchaseInvoicesResult,
    IvaRetentionExportRow,
    IvaRetentionExportPayload,
    IslrRetentionExportRow,
    IslrRetentionExportPayload,
};

function reportError(fallback: string, e: unknown): void {
    notify.error(e instanceof Error ? e.message : fallback);
}

export function usePurchases() {
    const [suppliers, setSuppliers]                           = useState<Supplier[]>([]);
    const [purchaseInvoices, setPurchaseInvoices]             = useState<PurchaseInvoice[]>([]);
    const [currentPurchaseInvoice, setCurrentPurchaseInvoice] = useState<PurchaseInvoice | null>(null);

    const [loadingSuppliers, setLoadingSuppliers]                   = useState(false);
    const [loadingPurchaseInvoices, setLoadingPurchaseInvoices]     = useState(false);
    const [loadingPurchaseInvoice, setLoadingPurchaseInvoice]       = useState(false);
    const [migratingPurchaseInvoices, setMigratingPurchaseInvoices] = useState(false);

    // ── Suppliers ──────────────────────────────────────────────────────────────

    const loadSuppliers = useCallback(async (companyId: string) => {
        setLoadingSuppliers(true);
        try {
            const res = await apiFetch(`/api/purchases/suppliers?companyId=${encodeURIComponent(companyId)}`);
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
            const res = await apiFetch('/api/purchases/suppliers', {
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
            const res = await apiFetch(`/api/purchases/suppliers/${id}`, { method: 'DELETE' });
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
            const res = await apiFetch(`/api/purchases?companyId=${encodeURIComponent(companyId)}`);
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
            const res = await apiFetch(`/api/purchases/${encodeURIComponent(invoiceId)}`);
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
            const url = invoice.id ? `/api/purchases/${invoice.id}` : '/api/purchases';
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
            const res = await apiFetch(`/api/purchases/${invoiceId}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al eliminar factura'); return false; }
            setPurchaseInvoices((prev) => prev.filter((f) => f.id !== invoiceId));
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    // After (un)confirming, the RPC returns only the header (row_to_json).
    // Refetch the full invoice with items so the detail page keeps the
    // breakdown intact.
    const refetchFullInvoice = useCallback(async (invoiceId: string): Promise<PurchaseInvoice | null> => {
        try {
            const res = await apiFetch(`/api/purchases/${encodeURIComponent(invoiceId)}`);
            const json = await res.json();
            if (!res.ok) return null;
            return json.data ?? null;
        } catch {
            return null;
        }
    }, []);

    const confirmPurchaseInvoice = useCallback(async (invoiceId: string): Promise<PurchaseInvoice | null> => {
        try {
            const res = await apiFetch(`/api/purchases/${invoiceId}/confirm`, { method: 'POST' });
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
            const res = await apiFetch(`/api/purchases/${invoiceId}/unconfirm`, { method: 'POST' });
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

    const imputePurchaseInvoiceItems = useCallback(async (
        invoiceId: string,
        items:     PurchaseInvoiceItem[],
    ): Promise<PurchaseInvoice | null> => {
        try {
            const res = await apiFetch(`/api/purchases/${encodeURIComponent(invoiceId)}/impute-items`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ items }),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al imputar items'); return null; }
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

    const migratePurchaseInvoices = useCallback(async (
        invoiceIds:      string[],
        targetCompanyId: string,
        targetPeriod?:   string | null,
    ): Promise<MigratePurchaseInvoicesResult | null> => {
        setMigratingPurchaseInvoices(true);
        try {
            const res = await apiFetch('/api/purchases/migrate', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ invoiceIds, targetCompanyId, targetPeriod: targetPeriod ?? null }),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al migrar facturas'); return null; }
            const data = json.data as MigratePurchaseInvoicesResult;
            const migratedIds = new Set(data.migrated.map((m) => m.id));
            if (migratedIds.size > 0) {
                setPurchaseInvoices((prev) => prev.filter((f) => !migratedIds.has(f.id ?? '')));
            }
            return data;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        } finally {
            setMigratingPurchaseInvoices(false);
        }
    }, []);

    // ── SENIAT exports ────────────────────────────────────────────────────────

    const fetchIvaRetentionExport = useCallback(async (
        companyId: string,
        period:    string,
    ): Promise<IvaRetentionExportPayload | null> => {
        try {
            const res = await apiFetch(
                `/api/purchases/iva-retention-export?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) {
                notify.error(json.error ?? 'Error al consultar retenciones IVA');
                return null;
            }
            return (json.data ?? null) as IvaRetentionExportPayload | null;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const fetchIslrRetentionsExport = useCallback(async (
        companyId: string,
        period:    string,
    ): Promise<IslrRetentionExportPayload | null> => {
        try {
            const res = await apiFetch(
                `/api/purchases/islr-retentions-export?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`
            );
            const json = await res.json();
            if (!res.ok) {
                notify.error(json.error ?? 'Error al consultar retenciones ISLR');
                return null;
            }
            return (json.data ?? null) as IslrRetentionExportPayload | null;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    return {
        // state
        suppliers, purchaseInvoices, currentPurchaseInvoice,
        // loading
        loadingSuppliers, loadingPurchaseInvoices, loadingPurchaseInvoice, migratingPurchaseInvoices,
        // suppliers actions
        loadSuppliers, saveSupplier, deleteSupplier,
        // invoice actions
        loadPurchaseInvoices, loadPurchaseInvoice, savePurchaseInvoice, deletePurchaseInvoice,
        confirmPurchaseInvoice, unconfirmPurchaseInvoice, imputePurchaseInvoiceItems, migratePurchaseInvoices,
        // SENIAT exports
        fetchIvaRetentionExport, fetchIslrRetentionsExport,
    };
}
