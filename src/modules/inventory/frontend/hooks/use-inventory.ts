"use client";

import { useState, useCallback } from 'react';
import type { Producto } from '../../backend/domain/producto';
import type { Movimiento, KardexEntry } from '../../backend/domain/movimiento';
import type { Transformacion, Cierre } from '../../backend/domain/transformacion';
import type { Proveedor } from '../../backend/domain/proveedor';
import type { FacturaCompra, FacturaCompraItem } from '../../backend/domain/factura-compra';

export type { Producto, Movimiento, KardexEntry, Transformacion, Cierre, Proveedor, FacturaCompra, FacturaCompraItem };

export function useInventory() {
    const [productos, setProductos]             = useState<Producto[]>([]);
    const [movimientos, setMovimientos]         = useState<Movimiento[]>([]);
    const [kardex, setKardex]                   = useState<KardexEntry[]>([]);
    const [transformaciones, setTransformaciones] = useState<Transformacion[]>([]);
    const [cierres, setCierres]                 = useState<Cierre[]>([]);
    const [proveedores, setProveedores]         = useState<Proveedor[]>([]);
    const [facturas, setFacturas]               = useState<FacturaCompra[]>([]);
    const [currentFactura, setCurrentFactura]   = useState<FacturaCompra | null>(null);

    const [loadingProductos, setLoadingProductos]         = useState(false);
    const [loadingMovimientos, setLoadingMovimientos]     = useState(false);
    const [loadingKardex, setLoadingKardex]               = useState(false);
    const [loadingTransformaciones, setLoadingTransformaciones] = useState(false);
    const [loadingCierres, setLoadingCierres]             = useState(false);
    const [loadingProveedores, setLoadingProveedores]     = useState(false);
    const [loadingFacturas, setLoadingFacturas]           = useState(false);
    const [loadingFactura, setLoadingFactura]             = useState(false);

    const [error, setError] = useState<string | null>(null);

    // ── Productos ──────────────────────────────────────────────────────────────

    const loadProductos = useCallback(async (empresaId: string) => {
        setLoadingProductos(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/productos?empresaId=${encodeURIComponent(empresaId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar productos'); return; }
            setProductos(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingProductos(false);
        }
    }, []);

    const saveProducto = useCallback(async (producto: Producto): Promise<Producto | null> => {
        setError(null);
        try {
            const res = await fetch('/api/inventory/productos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(producto),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar producto'); return null; }
            const saved: Producto = json.data;
            setProductos((prev) => {
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

    const deleteProducto = useCallback(async (id: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await fetch(`/api/inventory/productos/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar producto'); return false; }
            setProductos((prev) => prev.filter((p) => p.id !== id));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Movimientos ────────────────────────────────────────────────────────────

    const loadMovimientos = useCallback(async (empresaId: string, periodo?: string) => {
        setLoadingMovimientos(true);
        setError(null);
        try {
            const params = new URLSearchParams({ empresaId });
            if (periodo) params.set('periodo', periodo);
            const res = await fetch(`/api/inventory/movimientos?${params}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar movimientos'); return; }
            setMovimientos(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingMovimientos(false);
        }
    }, []);

    const saveMovimiento = useCallback(async (movimiento: Movimiento): Promise<Movimiento | null> => {
        setError(null);
        try {
            const res = await fetch('/api/inventory/movimientos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(movimiento),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar movimiento'); return null; }
            const saved: Movimiento = json.data;
            setMovimientos((prev) => [saved, ...prev]);
            // Refresh producto existencia
            setProductos((prev) =>
                prev.map((p) =>
                    p.id === saved.productoId
                        ? { ...p, existenciaActual: saved.saldoCantidad }
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

    const loadKardex = useCallback(async (empresaId: string, productoId: string) => {
        setLoadingKardex(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/inventory/kardex?empresaId=${encodeURIComponent(empresaId)}&productoId=${encodeURIComponent(productoId)}`
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

    // ── Transformaciones ───────────────────────────────────────────────────────

    const loadTransformaciones = useCallback(async (empresaId: string) => {
        setLoadingTransformaciones(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/transformaciones?empresaId=${encodeURIComponent(empresaId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar transformaciones'); return; }
            setTransformaciones(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingTransformaciones(false);
        }
    }, []);

    const saveTransformacion = useCallback(async (transformacion: Transformacion): Promise<Transformacion | null> => {
        setError(null);
        try {
            const res = await fetch('/api/inventory/transformaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transformacion),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar transformación'); return null; }
            const saved: Transformacion = json.data;
            setTransformaciones((prev) => [saved, ...prev]);
            return saved;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    // ── Cierres ────────────────────────────────────────────────────────────────

    const loadCierres = useCallback(async (empresaId: string) => {
        setLoadingCierres(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/cierres?empresaId=${encodeURIComponent(empresaId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar cierres'); return; }
            setCierres(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingCierres(false);
        }
    }, []);

    const saveCierre = useCallback(async (empresaId: string, periodo: string, notas?: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await fetch('/api/inventory/cierres', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empresaId, periodo, notas: notas ?? '' }),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cerrar período'); return false; }
            if (json.data) setCierres((prev) => [json.data, ...prev]);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Proveedores ────────────────────────────────────────────────────────────

    const loadProveedores = useCallback(async (empresaId: string) => {
        setLoadingProveedores(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/proveedores?empresaId=${encodeURIComponent(empresaId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar proveedores'); return; }
            setProveedores(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingProveedores(false);
        }
    }, []);

    const saveProveedor = useCallback(async (proveedor: Proveedor): Promise<Proveedor | null> => {
        setError(null);
        try {
            const res = await fetch('/api/inventory/proveedores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(proveedor),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar proveedor'); return null; }
            const saved: Proveedor = json.data;
            setProveedores((prev) => {
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

    const deleteProveedor = useCallback(async (id: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await fetch(`/api/inventory/proveedores/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar proveedor'); return false; }
            setProveedores((prev) => prev.filter((p) => p.id !== id));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Facturas de Compra ─────────────────────────────────────────────────────

    const loadFacturas = useCallback(async (empresaId: string) => {
        setLoadingFacturas(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/compras?empresaId=${encodeURIComponent(empresaId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar facturas'); return; }
            setFacturas(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingFacturas(false);
        }
    }, []);

    const loadFactura = useCallback(async (facturaId: string) => {
        setLoadingFactura(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/compras/${encodeURIComponent(facturaId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar factura'); return; }
            setCurrentFactura(json.data ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingFactura(false);
        }
    }, []);

    const saveFactura = useCallback(async (
        factura: FacturaCompra,
        items: FacturaCompraItem[],
    ): Promise<FacturaCompra | null> => {
        setError(null);
        try {
            const url = factura.id
                ? `/api/inventory/compras/${factura.id}`
                : '/api/inventory/compras';
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ factura, items }),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar factura'); return null; }
            const saved: FacturaCompra = json.data;
            setFacturas((prev) => {
                const idx = prev.findIndex((f) => f.id === saved.id);
                return idx >= 0
                    ? prev.map((f) => (f.id === saved.id ? saved : f))
                    : [saved, ...prev];
            });
            setCurrentFactura(saved);
            return saved;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    const confirmarFactura = useCallback(async (facturaId: string): Promise<FacturaCompra | null> => {
        setError(null);
        try {
            const res = await fetch(`/api/inventory/compras/${facturaId}/confirmar`, {
                method: 'POST',
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al confirmar factura'); return null; }
            const confirmed: FacturaCompra = json.data;
            setFacturas((prev) => prev.map((f) => (f.id === confirmed.id ? confirmed : f)));
            setCurrentFactura(confirmed);
            return confirmed;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return null;
        }
    }, []);

    return {
        // state
        productos, movimientos, kardex, transformaciones, cierres,
        proveedores, facturas, currentFactura,
        // loading
        loadingProductos, loadingMovimientos, loadingKardex,
        loadingTransformaciones, loadingCierres,
        loadingProveedores, loadingFacturas, loadingFactura,
        // error
        error, setError,
        // actions
        loadProductos, saveProducto, deleteProducto,
        loadMovimientos, saveMovimiento,
        loadKardex,
        loadTransformaciones, saveTransformacion,
        loadCierres, saveCierre,
        loadProveedores, saveProveedor, deleteProveedor,
        loadFacturas, loadFactura, saveFactura, confirmarFactura,
    };
}
