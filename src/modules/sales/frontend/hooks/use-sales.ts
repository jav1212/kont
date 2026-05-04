'use client';

// Frontend hook: useSales
// Owns state and async actions for the Sales module — customers, sales
// invoices, IGTF percepción quincenal report.

import { useState, useCallback } from 'react';
import type { Customer } from '../../backend/domain/customer';
import type { SalesInvoice, SalesInvoiceItem } from '../../backend/domain/sales-invoice';
import type { IgtfFortnightlyReport } from '../../backend/domain/igtf-fortnightly-report';
import { apiFetch } from '@/src/shared/frontend/utils/api-fetch';
import { notify } from '@/src/shared/frontend/notify';

export type { Customer, SalesInvoice, SalesInvoiceItem, IgtfFortnightlyReport };

function reportError(fallback: string, e: unknown): void {
    notify.error(e instanceof Error ? e.message : fallback);
}

export function useSales() {
    const [customers, setCustomers]               = useState<Customer[]>([]);
    const [salesInvoices, setSalesInvoices]       = useState<SalesInvoice[]>([]);
    const [currentSalesInvoice, setCurrentSalesInvoice] = useState<SalesInvoice | null>(null);

    const [loadingCustomers, setLoadingCustomers]                 = useState(false);
    const [loadingSalesInvoices, setLoadingSalesInvoices]         = useState(false);
    const [loadingSalesInvoice, setLoadingSalesInvoice]           = useState(false);

    // ── Customers ──────────────────────────────────────────────────────────────

    const loadCustomers = useCallback(async (companyId: string) => {
        setLoadingCustomers(true);
        try {
            const res = await apiFetch(`/api/sales/customers?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar clientes'); return; }
            setCustomers(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingCustomers(false);
        }
    }, []);

    const saveCustomer = useCallback(async (customer: Customer): Promise<Customer | null> => {
        try {
            const res = await apiFetch('/api/sales/customers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(customer),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar cliente'); return null; }
            const saved: Customer = json.data;
            setCustomers((prev) => {
                const idx = prev.findIndex((c) => c.id === saved.id);
                return idx >= 0
                    ? prev.map((c) => (c.id === saved.id ? saved : c))
                    : [...prev, saved];
            });
            return saved;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const deleteCustomer = useCallback(async (id: string): Promise<{ ok: boolean; softDeleted?: boolean }> => {
        try {
            const res = await apiFetch(`/api/sales/customers/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al eliminar cliente'); return { ok: false }; }
            const softDeleted = Boolean(json.data?.softDeleted);
            if (softDeleted) {
                setCustomers((prev) => prev.map((c) => c.id === id ? { ...c, active: false } : c));
            } else {
                setCustomers((prev) => prev.filter((c) => c.id !== id));
            }
            return { ok: true, softDeleted };
        } catch (e) {
            reportError('Error de red', e);
            return { ok: false };
        }
    }, []);

    // ── Sales invoices ─────────────────────────────────────────────────────────

    const loadSalesInvoices = useCallback(async (companyId: string) => {
        setLoadingSalesInvoices(true);
        try {
            const res = await apiFetch(`/api/sales?companyId=${encodeURIComponent(companyId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar facturas'); return; }
            setSalesInvoices(json.data ?? []);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingSalesInvoices(false);
        }
    }, []);

    const loadSalesInvoice = useCallback(async (invoiceId: string) => {
        setLoadingSalesInvoice(true);
        try {
            const res = await apiFetch(`/api/sales/${encodeURIComponent(invoiceId)}`);
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al cargar factura'); return; }
            setCurrentSalesInvoice(json.data ?? null);
        } catch (e) {
            reportError('Error de red', e);
        } finally {
            setLoadingSalesInvoice(false);
        }
    }, []);

    const saveSalesInvoice = useCallback(async (
        invoice: SalesInvoice,
        items: SalesInvoiceItem[],
    ): Promise<SalesInvoice | null> => {
        try {
            const url = invoice.id ? `/api/sales/${invoice.id}` : '/api/sales';
            const res = await apiFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice, items }),
            });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al guardar factura'); return null; }
            const saved: SalesInvoice = json.data;
            setSalesInvoices((prev) => {
                const idx = prev.findIndex((f) => f.id === saved.id);
                return idx >= 0
                    ? prev.map((f) => (f.id === saved.id ? saved : f))
                    : [saved, ...prev];
            });
            setCurrentSalesInvoice(saved);
            return saved;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, []);

    const deleteSalesInvoice = useCallback(async (invoiceId: string): Promise<boolean> => {
        try {
            const res = await apiFetch(`/api/sales/${invoiceId}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al eliminar factura'); return false; }
            setSalesInvoices((prev) => prev.filter((f) => f.id !== invoiceId));
            return true;
        } catch (e) {
            reportError('Error de red', e);
            return false;
        }
    }, []);

    const refetchFullInvoice = useCallback(async (invoiceId: string): Promise<SalesInvoice | null> => {
        try {
            const res = await apiFetch(`/api/sales/${encodeURIComponent(invoiceId)}`);
            const json = await res.json();
            if (!res.ok) return null;
            return json.data ?? null;
        } catch {
            return null;
        }
    }, []);

    const confirmSalesInvoice = useCallback(async (invoiceId: string): Promise<SalesInvoice | null> => {
        try {
            const res = await apiFetch(`/api/sales/${invoiceId}/confirm`, { method: 'POST' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al confirmar factura'); return null; }
            const headerOnly: SalesInvoice = json.data;
            const full = (await refetchFullInvoice(headerOnly.id!)) ?? headerOnly;
            setSalesInvoices((prev) => prev.map((f) => f.id === full.id ? full : f));
            setCurrentSalesInvoice(full);
            return full;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, [refetchFullInvoice]);

    const unconfirmSalesInvoice = useCallback(async (invoiceId: string): Promise<SalesInvoice | null> => {
        try {
            const res = await apiFetch(`/api/sales/${invoiceId}/unconfirm`, { method: 'POST' });
            const json = await res.json();
            if (!res.ok) { notify.error(json.error ?? 'Error al desconfirmar factura'); return null; }
            const headerOnly: SalesInvoice = json.data;
            const full = (await refetchFullInvoice(headerOnly.id!)) ?? headerOnly;
            setSalesInvoices((prev) => prev.map((f) => f.id === full.id ? full : f));
            setCurrentSalesInvoice(full);
            return full;
        } catch (e) {
            reportError('Error de red', e);
            return null;
        }
    }, [refetchFullInvoice]);

    // ── IGTF Quincena Report ──────────────────────────────────────────────────

    // Returns { data, error } so the caller can decide whether to toast.
    // Avoids React 18 strict-mode double-toasting when the effect runs twice
    // and both invocations error: the page's cancelled flag suppresses the
    // stale call's notify.
    const fetchIgtfFortnightly = useCallback(async (
        companyId: string, year: number, month: number, quincena: 1 | 2,
    ): Promise<{ data: IgtfFortnightlyReport | null; error: string | null }> => {
        try {
            const params = new URLSearchParams({
                companyId,
                year:     String(year),
                month:    String(month),
                quincena: String(quincena),
            });
            const res = await apiFetch(`/api/sales/igtf-fortnightly?${params.toString()}`);
            const json = await res.json();
            if (!res.ok) {
                return { data: null, error: json.error ?? 'Error al consultar IGTF quincenal' };
            }
            return { data: (json.data ?? null) as IgtfFortnightlyReport | null, error: null };
        } catch (e) {
            return { data: null, error: e instanceof Error ? e.message : 'Error de red' };
        }
    }, []);

    return {
        // state
        customers, salesInvoices, currentSalesInvoice,
        // loading
        loadingCustomers, loadingSalesInvoices, loadingSalesInvoice,
        // customer actions
        loadCustomers, saveCustomer, deleteCustomer,
        // invoice actions
        loadSalesInvoices, loadSalesInvoice, saveSalesInvoice,
        deleteSalesInvoice, confirmSalesInvoice, unconfirmSalesInvoice,
        // IGTF report
        fetchIgtfFortnightly,
    };
}
