"use client";

import { useState, useCallback, useMemo } from 'react';
import type { Producto } from '../../backend/domain/producto';
import type { Movimiento, KardexEntry } from '../../backend/domain/movimiento';
import type { Transformacion, Cierre } from '../../backend/domain/transformacion';
import type { Proveedor } from '../../backend/domain/proveedor';
import type { FacturaCompra, FacturaCompraItem } from '../../backend/domain/factura-compra';
import type { Departamento } from '../../backend/domain/departamento';
import type { ReportePeriodoRow } from '../../backend/domain/reporte-periodo';
import type { LibroComprasRow } from '../../backend/domain/libro-compras';
import type { ReporteISLRProducto, ReporteISLRMovimiento } from '../../backend/domain/reporte-islr';
import type { LibroVentasRow } from '../../backend/domain/libro-ventas';
import type { LibroInventariosRow } from '../../backend/domain/libro-inventarios';
import type { ReporteSaldoRow } from '../../backend/domain/reporte-saldo';

export type { Producto, Movimiento, KardexEntry, Transformacion, Cierre, Proveedor, FacturaCompra, FacturaCompraItem, Departamento, ReportePeriodoRow, LibroComprasRow, ReporteISLRProducto, ReporteISLRMovimiento, LibroVentasRow, LibroInventariosRow, ReporteSaldoRow };

export function useInventory() {
    const [productos, setProductos]             = useState<Producto[]>([]);
    const [movimientos, setMovimientos]         = useState<Movimiento[]>([]);
    const [kardex, setKardex]                   = useState<KardexEntry[]>([]);
    const [transformaciones, setTransformaciones] = useState<Transformacion[]>([]);
    const [cierres, setCierres]                 = useState<Cierre[]>([]);
    const [proveedores, setProveedores]         = useState<Proveedor[]>([]);
    const [facturas, setFacturas]               = useState<FacturaCompra[]>([]);
    const [currentFactura, setCurrentFactura]   = useState<FacturaCompra | null>(null);
    const [departamentos, setDepartamentos]     = useState<Departamento[]>([]);
    const [reportePeriodo, setReportePeriodo]   = useState<ReportePeriodoRow[]>([]);
    const [libroCompras, setLibroCompras]       = useState<LibroComprasRow[]>([]);
    const [reporteISLR, setReporteISLR]         = useState<ReporteISLRProducto[]>([]);
    const [libroVentas, setLibroVentas]             = useState<LibroVentasRow[]>([]);
    const [libroInventarios, setLibroInventarios]   = useState<LibroInventariosRow[]>([]);
    const [reporteSaldo, setReporteSaldo]           = useState<ReporteSaldoRow[]>([]);

    const [loadingProductos, setLoadingProductos]         = useState(false);
    const [loadingMovimientos, setLoadingMovimientos]     = useState(false);
    const [loadingKardex, setLoadingKardex]               = useState(false);
    const [loadingTransformaciones, setLoadingTransformaciones] = useState(false);
    const [loadingCierres, setLoadingCierres]             = useState(false);
    const [loadingProveedores, setLoadingProveedores]     = useState(false);
    const [loadingFacturas, setLoadingFacturas]           = useState(false);
    const [loadingFactura, setLoadingFactura]             = useState(false);
    const [loadingDepartamentos, setLoadingDepartamentos] = useState(false);
    const [loadingReporte, setLoadingReporte]             = useState(false);
    const [loadingLibroCompras, setLoadingLibroCompras]   = useState(false);
    const [loadingReporteISLR, setLoadingReporteISLR]     = useState(false);
    const [loadingLibroVentas, setLoadingLibroVentas]         = useState(false);
    const [loadingLibroInventarios, setLoadingLibroInventarios] = useState(false);
    const [loadingReporteSaldo, setLoadingReporteSaldo]         = useState(false);

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

    const tasaDolarActual = useMemo(
        () => cierres.find((c) => c.tasaDolar != null)?.tasaDolar ?? null,
        [cierres],
    );

    const saveCierre = useCallback(async (
        empresaId: string,
        periodo: string,
        notas?: string,
        tasaDolar?: number | null,
    ): Promise<boolean> => {
        setError(null);
        try {
            const res = await fetch('/api/inventory/cierres', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ empresaId, periodo, notas: notas ?? '', tasaDolar: tasaDolar ?? null }),
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
            const res = await fetch(`/api/inventory/entradas?empresaId=${encodeURIComponent(empresaId)}`);
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
            const res = await fetch(`/api/inventory/entradas/${encodeURIComponent(facturaId)}`);
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
                ? `/api/inventory/entradas/${factura.id}`
                : '/api/inventory/entradas';
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

    const deleteFactura = useCallback(async (facturaId: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await fetch(`/api/inventory/entradas/${facturaId}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar factura'); return false; }
            setFacturas((prev) => prev.filter((f) => f.id !== facturaId));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    const confirmarFactura = useCallback(async (facturaId: string): Promise<FacturaCompra | null> => {
        setError(null);
        try {
            const res = await fetch(`/api/inventory/entradas/${facturaId}/confirmar`, {
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

    // ── Departamentos ─────────────────────────────────────────────────────────

    const loadDepartamentos = useCallback(async (empresaId: string) => {
        setLoadingDepartamentos(true);
        setError(null);
        try {
            const res = await fetch(`/api/inventory/departamentos?empresaId=${encodeURIComponent(empresaId)}`);
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar departamentos'); return; }
            setDepartamentos(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingDepartamentos(false);
        }
    }, []);

    const saveDepartamento = useCallback(async (departamento: Departamento): Promise<Departamento | null> => {
        setError(null);
        try {
            const res = await fetch('/api/inventory/departamentos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(departamento),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al guardar departamento'); return null; }
            const saved: Departamento = json.data;
            setDepartamentos((prev) => {
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

    const deleteDepartamento = useCallback(async (id: string): Promise<boolean> => {
        setError(null);
        try {
            const res = await fetch(`/api/inventory/departamentos/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al eliminar departamento'); return false; }
            setDepartamentos((prev) => prev.filter((d) => d.id !== id));
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Libro de Compras ──────────────────────────────────────────────────────

    const loadLibroCompras = useCallback(async (empresaId: string, periodo: string) => {
        setLoadingLibroCompras(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/inventory/libro-entradas?empresaId=${encodeURIComponent(empresaId)}&periodo=${encodeURIComponent(periodo)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar libro de entradas'); return; }
            setLibroCompras(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingLibroCompras(false);
        }
    }, []);

    // ── Reporte ISLR Art. 177 ─────────────────────────────────────────────────

    const loadReporteISLR = useCallback(async (empresaId: string, periodo: string) => {
        setLoadingReporteISLR(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/inventory/reporte-islr?empresaId=${encodeURIComponent(empresaId)}&periodo=${encodeURIComponent(periodo)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar reporte ISLR'); return; }
            setReporteISLR(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingReporteISLR(false);
        }
    }, []);

    // ── Libro de Ventas ───────────────────────────────────────────────────────

    const loadLibroVentas = useCallback(async (empresaId: string, periodo: string) => {
        setLoadingLibroVentas(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/inventory/libro-salidas?empresaId=${encodeURIComponent(empresaId)}&periodo=${encodeURIComponent(periodo)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar libro de salidas'); return; }
            setLibroVentas(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingLibroVentas(false);
        }
    }, []);

    const saveVenta = useCallback(async (payload: {
        empresaId: string;
        fecha: string;
        referencia?: string;
        items: { productoId: string; cantidad: number; existenciaActual?: number }[];
    }): Promise<boolean> => {
        setError(null);
        try {
            const res = await fetch('/api/inventory/salidas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al registrar salida'); return false; }
            const saved = json.data as import('../../backend/domain/movimiento').Movimiento[];
            // Update product existencias
            setProductos((prev) =>
                prev.map((p) => {
                    const lastMov = saved.filter((m) => m.productoId === p.id).at(-1);
                    return lastMov ? { ...p, existenciaActual: lastMov.saldoCantidad } : p;
                })
            );
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
            return false;
        }
    }, []);

    // ── Libro de Inventarios ──────────────────────────────────────────────────

    const loadLibroInventarios = useCallback(async (empresaId: string, anio: number) => {
        setLoadingLibroInventarios(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/inventory/libro-inventarios?empresaId=${encodeURIComponent(empresaId)}&anio=${anio}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar libro de inventarios'); return; }
            setLibroInventarios(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingLibroInventarios(false);
        }
    }, []);

    // ── Reporte SALDO por Departamento ────────────────────────────────────────

    const loadReporteSaldo = useCallback(async (empresaId: string, periodo: string) => {
        setLoadingReporteSaldo(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/inventory/reporte-saldo?empresaId=${encodeURIComponent(empresaId)}&periodo=${encodeURIComponent(periodo)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar reporte SALDO'); return; }
            setReporteSaldo(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingReporteSaldo(false);
        }
    }, []);

    // ── Reporte de Período ────────────────────────────────────────────────────

    const loadReportePeriodo = useCallback(async (empresaId: string, periodo: string) => {
        setLoadingReporte(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/inventory/reporte?empresaId=${encodeURIComponent(empresaId)}&periodo=${encodeURIComponent(periodo)}`
            );
            const json = await res.json();
            if (!res.ok) { setError(json.error ?? 'Error al cargar reporte'); return; }
            setReportePeriodo(json.data ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error de red');
        } finally {
            setLoadingReporte(false);
        }
    }, []);

    return {
        // state
        productos, movimientos, kardex, transformaciones, cierres,
        proveedores, facturas, currentFactura,
        departamentos, reportePeriodo, libroCompras, reporteISLR, libroVentas, libroInventarios, reporteSaldo,
        tasaDolarActual,
        // loading
        loadingProductos, loadingMovimientos, loadingKardex,
        loadingTransformaciones, loadingCierres,
        loadingProveedores, loadingFacturas, loadingFactura,
        loadingDepartamentos, loadingReporte, loadingLibroCompras, loadingReporteISLR, loadingLibroVentas, loadingLibroInventarios, loadingReporteSaldo,
        // error
        error, setError,
        // actions
        loadProductos, saveProducto, deleteProducto,
        loadMovimientos, saveMovimiento,
        loadKardex,
        loadTransformaciones, saveTransformacion,
        loadCierres, saveCierre,
        loadProveedores, saveProveedor, deleteProveedor,
        loadFacturas, loadFactura, saveFactura, confirmarFactura, deleteFactura,
        loadDepartamentos, saveDepartamento, deleteDepartamento,
        loadReportePeriodo,
        loadLibroCompras,
        loadReporteISLR,
        loadLibroVentas, saveVenta,
        loadLibroInventarios,
        loadReporteSaldo,
    };
}
