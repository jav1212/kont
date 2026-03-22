"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { FacturaCompra, FacturaCompraItem } from "@/src/modules/inventory/backend/domain/factura-compra";
import { FacturaItemsGrid, emptyItem } from "@/src/modules/inventory/frontend/components/factura-items-grid";
import type { TipoProducto, IvaTipo } from "@/src/modules/inventory/backend/domain/producto";

const fmtTasa = (n: number | null) =>
    n == null ? "" : String(n);

// ── helpers ──────────────────────────────────────────────────────────────────

const fieldCls = [
    "w-full h-10 px-3 rounded-lg border border-border-light bg-surface-1 outline-none",
    "font-mono text-[14px] text-foreground tabular-nums",
    "focus:border-primary-500/60 hover:border-border-medium transition-colors duration-150",
].join(" ");

const labelCls = "font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] mb-1.5 block";

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const todayStr = () => new Date().toISOString().split("T")[0];

// ── QuickModal ────────────────────────────────────────────────────────────────

function QuickModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-[440px] max-h-[85vh] overflow-y-auto bg-surface-1 rounded-xl border border-border-medium shadow-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[14px] font-bold uppercase tracking-[0.14em] text-foreground">{title}</h3>
                    <button
                        onClick={onClose}
                        className="w-6 h-6 flex items-center justify-center text-[var(--text-tertiary)] hover:text-foreground text-[16px] leading-none rounded transition-colors"
                    >
                        ×
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ── ProveedorCombobox ─────────────────────────────────────────────────────────

interface ProveedorComboboxProps {
    proveedorId: string;
    proveedores: { id?: string; nombre: string; rif?: string; activo?: boolean }[];
    onChange: (id: string) => void;
    onRequestCreate: (search: string) => void;
}

function ProveedorCombobox({ proveedorId, proveedores, onChange, onRequestCreate }: ProveedorComboboxProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [hiIdx, setHiIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const selected = proveedores.find((p) => p.id === proveedorId);

    const filtered = proveedores
        .filter(
            (p) =>
                p.activo !== false &&
                (p.nombre.toLowerCase().includes(search.toLowerCase()) ||
                    (p.rif ?? "").toLowerCase().includes(search.toLowerCase())),
        )
        .slice(0, 12);

    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.children[hiIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: "nearest" });
    }, [hiIdx]);

    function openDropdown() { setSearch(""); setHiIdx(0); setOpen(true); }
    function closeDropdown() { setOpen(false); setSearch(""); }
    function selectItem(id: string) { onChange(id); closeDropdown(); }

    function handleBlur(e: React.FocusEvent) {
        if (!wrapRef.current?.contains(e.relatedTarget as Node)) closeDropdown();
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if (open) {
            if (e.key === "ArrowDown") { e.preventDefault(); setHiIdx((i) => Math.min(i + 1, filtered.length - 1)); return; }
            if (e.key === "ArrowUp")   { e.preventDefault(); setHiIdx((i) => Math.max(i - 1, 0)); return; }
            if (e.key === "Enter") {
                e.preventDefault();
                if (filtered[hiIdx]) selectItem(filtered[hiIdx].id!);
                return;
            }
            if (e.key === "Escape") { e.preventDefault(); closeDropdown(); return; }
        }
    }

    const displayValue = open
        ? search
        : selected
          ? [selected.rif, selected.nombre].filter(Boolean).join(" · ")
          : "";

    return (
        <div ref={wrapRef} className="relative flex-1" onBlur={handleBlur}>
            <input
                className={fieldCls}
                value={displayValue}
                placeholder={open ? "Buscar proveedor…" : "Seleccionar proveedor…"}
                onChange={(e) => { setSearch(e.target.value); setHiIdx(0); }}
                onFocus={openDropdown}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                spellCheck={false}
            />
            {open && (
                <div className="absolute left-0 top-full z-50 min-w-full mt-0.5 rounded-lg border border-border-medium bg-surface-1 shadow-xl overflow-hidden">
                    {filtered.length === 0 ? (
                        <div className="px-3 py-2.5 text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em]">Sin resultados</div>
                    ) : (
                        <ul ref={listRef} className="max-h-52 overflow-y-auto">
                            {filtered.map((p, i) => (
                                <li
                                    key={p.id}
                                    className={[
                                        "px-3 py-2 cursor-pointer flex items-center gap-2 text-[13px]",
                                        i === hiIdx ? "bg-primary-500/10 text-foreground" : "text-[var(--text-secondary)] hover:bg-surface-2",
                                    ].join(" ")}
                                    onMouseDown={(e) => { e.preventDefault(); selectItem(p.id!); }}
                                    onMouseEnter={() => setHiIdx(i)}
                                >
                                    {p.rif && (
                                        <span className="font-mono text-[11px] text-[var(--text-tertiary)] min-w-[80px]">{p.rif}</span>
                                    )}
                                    <span className="truncate">{p.nombre}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <button
                        className="w-full px-3 py-2 text-left text-[12px] text-primary-500 hover:bg-primary-500/[0.06] border-t border-border-light/50 transition-colors"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onRequestCreate(search);
                            closeDropdown();
                        }}
                    >
                        + Crear{search ? ` "${search}"` : ' nuevo proveedor'}
                    </button>
                </div>
            )}
        </div>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function NuevaFacturaPage() {
    const router = useRouter();
    const { companyId } = useCompany();
    const {
        productos, loadProductos,
        proveedores, loadProveedores,
        cierres, loadCierres,
        tasaDolarActual,
        error, setError,
        saveFactura, confirmarFactura,
        saveProveedor,
        saveProducto,
        departamentos, loadDepartamentos,
        saveDepartamento,
    } = useInventory();

    // Form state
    const [proveedorId, setProveedorId] = useState("");
    const [numeroFactura, setNumeroFactura] = useState("");
    const [numeroControl, setNumeroControl] = useState("");
    const [fecha, setFecha] = useState(todayStr());
    const [notas, setNotas] = useState("");
    const [tasaDolar, setTasaDolar] = useState<string>("");
    const [tasaFechaBcv, setTasaFechaBcv] = useState<string | null>(null);
    const [tasaLoading, setTasaLoading] = useState(false);
    const [tasaError, setTasaError] = useState<string | null>(null);
    const [items, setItems] = useState<FacturaCompraItem[]>([emptyItem()]);

    // ivaPorcentaje removed — IVA is now computed per-item from ivaAlicuota

    const [saving, setSaving] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [savedId, setSavedId] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    // Quick-create state
    const [qcMode, setQcMode] = useState<'proveedor' | 'producto' | null>(null);
    const [qcSaving, setQcSaving] = useState(false);

    // Quick create proveedor form
    const [qcProv, setQcProv] = useState({ nombre: '', rif: '' });

    // Quick create producto form
    const [qcProd, setQcProd] = useState({ nombre: '', codigo: '', tipo: 'mercancia' as TipoProducto, ivaTipo: 'general' as IvaTipo, departamentoId: '' });
    // Quick create departamento (nested inside producto modal)
    const [qcDeptNombre, setQcDeptNombre] = useState('');
    const [qcDeptOpen, setQcDeptOpen] = useState(false);
    const [qcDeptSaving, setQcDeptSaving] = useState(false);

    useEffect(() => {
        if (companyId) {
            loadProductos(companyId);
            loadProveedores(companyId);
            loadCierres(companyId);
            loadDepartamentos(companyId);
        }
    }, [companyId, loadProductos, loadProveedores, loadCierres, loadDepartamentos]);

    // Pre-fill tasa from last cierre when cierres load (only if BCV hasn't filled it)
    useEffect(() => {
        if (tasaDolarActual != null && tasaDolar === "" && !tasaLoading) {
            setTasaDolar(fmtTasa(tasaDolarActual));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasaDolarActual]);

    // Auto-fetch BCV rate when date changes
    useEffect(() => {
        if (!fecha) return;
        let cancelled = false;
        setTasaLoading(true);
        setTasaError(null);
        fetch(`/api/bcv/rate?date=${fecha}&code=USD`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                if (json.rate) {
                    setTasaDolar(String(json.rate));
                    setTasaFechaBcv(json.date);
                } else {
                    setTasaError(json.error ?? "Sin datos BCV para esta fecha");
                    setTasaFechaBcv(null);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setTasaError("Error al consultar BCV");
                    setTasaFechaBcv(null);
                }
            })
            .finally(() => { if (!cancelled) setTasaLoading(false); });
        return () => { cancelled = true; };
    }, [fecha]);

    // Derived totals — computed per-item from ivaAlicuota
    const subtotal      = items.reduce((acc, i) => acc + (i.costoTotal ?? 0), 0);
    const baseExenta    = items.filter(i => (i.ivaAlicuota ?? "general_16") === "exenta").reduce((acc, i) => acc + i.costoTotal, 0);
    const baseGravada8  = items.filter(i => (i.ivaAlicuota ?? "general_16") === "reducida_8").reduce((acc, i) => acc + i.costoTotal, 0);
    const baseGravada16 = items.filter(i => (i.ivaAlicuota ?? "general_16") === "general_16").reduce((acc, i) => acc + i.costoTotal, 0);
    const iva8          = Math.round(baseGravada8  * 8  / 100 * 100) / 100;
    const iva16         = Math.round(baseGravada16 * 16 / 100 * 100) / 100;
    const ivaMonto      = iva8 + iva16;
    const total         = subtotal + ivaMonto;

    const buildFactura = useCallback((): FacturaCompra => ({
        empresaId:     companyId!,
        proveedorId,
        numeroFactura,
        numeroControl,
        fecha,
        periodo:       fecha.slice(0, 7),
        estado:        "borrador",
        subtotal,
        ivaPorcentaje: 0,
        ivaMonto,
        total,
        notas,
    }), [companyId, proveedorId, numeroFactura, numeroControl, fecha, subtotal, ivaMonto, total, notas]);

    function validate(): boolean {
        if (!proveedorId) { setError("Selecciona un proveedor"); return false; }
        if (items.length === 0) { setError("Agrega al menos un producto"); return false; }
        for (const item of items) {
            if (!item.productoId) { setError("Selecciona un producto en cada fila"); return false; }
            if (item.cantidad <= 0) { setError("La cantidad debe ser mayor a 0"); return false; }
        }
        return true;
    }

    async function handleSaveDraft() {
        if (!validate()) return;
        setSaving(true);
        setError(null);
        const factura = buildFactura();
        if (savedId) factura.id = savedId;
        const saved = await saveFactura(factura, items);
        setSaving(false);
        if (saved?.id) setSavedId(saved.id);
    }

    async function handleConfirm() {
        if (!validate()) return;
        setConfirming(true);
        setError(null);
        // First save draft (or update existing)
        const factura = buildFactura();
        if (savedId) factura.id = savedId;
        const saved = await saveFactura(factura, items);
        if (!saved) { setConfirming(false); return; }
        // Then confirm
        const confirmed = await confirmarFactura(saved.id!);
        setConfirming(false);
        if (confirmed) {
            setConfirmed(true);
            setSavedId(confirmed.id!);
        }
    }

    async function handleQcProveedor() {
        if (!qcProv.nombre.trim()) { setError('El nombre es requerido'); return; }
        setQcSaving(true);
        const saved = await saveProveedor({ empresaId: companyId!, nombre: qcProv.nombre.trim(), rif: qcProv.rif.trim(), contacto: '', telefono: '', email: '', direccion: '', notas: '', activo: true });
        setQcSaving(false);
        if (saved) {
            setProveedorId(saved.id!);
            setQcMode(null);
            setQcProv({ nombre: '', rif: '' });
        }
    }

    async function handleQcDepartamento() {
        if (!qcDeptNombre.trim()) return;
        setQcDeptSaving(true);
        const saved = await saveDepartamento({ empresaId: companyId!, nombre: qcDeptNombre.trim(), descripcion: '', activo: true });
        setQcDeptSaving(false);
        if (saved) {
            setQcProd(p => ({ ...p, departamentoId: saved.id! }));
            setQcDeptNombre('');
            setQcDeptOpen(false);
        }
    }

    async function handleQcProducto() {
        if (!qcProd.nombre.trim()) { setError('El nombre del producto es requerido'); return; }
        setQcSaving(true);
        const saved = await saveProducto({
            empresaId: companyId!,
            nombre: qcProd.nombre.trim(),
            codigo: qcProd.codigo.trim(),
            descripcion: '',
            tipo: qcProd.tipo,
            unidadMedida: 'unidad',
            metodoValuacion: 'promedio_ponderado',
            existenciaActual: 0,
            costoPromedio: 0,
            activo: true,
            ivaTipo: qcProd.ivaTipo,
            departamentoId: qcProd.departamentoId || undefined,
        });
        setQcSaving(false);
        if (saved) {
            setQcMode(null);
            setQcProd({ nombre: '', codigo: '', tipo: 'mercancia', ivaTipo: 'general', departamentoId: '' });
        }
    }

    if (confirmed && savedId) {
        const periodo = fecha.slice(0, 7);
        return (
            <div className="min-h-full bg-surface-2 font-mono">
                <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                    <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                        Nueva Factura de Compra
                    </h1>
                </div>
                <div className="px-8 py-10 flex flex-col items-center gap-6">
                    <div className="rounded-xl border border-green-500/20 bg-green-500/[0.05] px-8 py-8 text-center max-w-md w-full">
                        <div className="text-green-500 text-[13px] font-bold uppercase tracking-[0.12em] mb-2">
                            Factura confirmada
                        </div>
                        <p className="text-[var(--text-secondary)] text-[13px] mb-6">
                            Las entradas de inventario han sido registradas exitosamente.
                        </p>
                        <div className="flex items-center justify-center gap-3">
                            <button
                                onClick={() => router.push("/inventory/entradas")}
                                className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Ver facturas
                            </button>
                            <button
                                onClick={() => router.push(`/inventory/movimientos?periodo=${periodo}`)}
                                className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Ver movimientos
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[16px] font-bold uppercase tracking-[0.14em] text-foreground">
                            Nueva Factura de Compra
                        </h1>
                        <p className="text-[12px] text-[var(--text-tertiary)] uppercase tracking-[0.12em] mt-0.5">
                            Registrar compra a proveedor
                        </p>
                    </div>
                    <button
                        onClick={() => router.back()}
                        className="h-9 px-3 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                    >
                        ← Volver
                    </button>
                </div>
            </div>

            <div className="px-8 py-6">
                {error && (
                    <div className="mb-4 px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[13px]">
                        {error}
                    </div>
                )}

                <div className="flex gap-6 items-start">
                    {/* Left panel — form (2/3) */}
                    <div className="flex-1 min-w-0 space-y-4">

                        {/* Datos de la factura */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground mb-5">
                                Datos de la factura
                            </h2>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Proveedor *</label>
                                    <div className="flex gap-2">
                                        <ProveedorCombobox
                                            proveedorId={proveedorId}
                                            proveedores={proveedores}
                                            onChange={setProveedorId}
                                            onRequestCreate={(search) => {
                                                setQcProv(p => ({ ...p, nombre: search }));
                                                setQcMode('proveedor');
                                                setError(null);
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setQcProv({ nombre: '', rif: '' }); setQcMode('proveedor'); setError(null); }}
                                            className="h-10 px-3 shrink-0 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-text-tertiary hover:text-foreground text-[16px] leading-none transition-colors"
                                            title="Crear nuevo proveedor"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelCls}>Nº Factura</label>
                                    <input
                                        className={fieldCls}
                                        value={numeroFactura}
                                        onChange={(e) => setNumeroFactura(e.target.value)}
                                        placeholder="Ej. 0001-00123456"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Nº Control</label>
                                    <input
                                        className={fieldCls}
                                        value={numeroControl}
                                        onChange={(e) => setNumeroControl(e.target.value)}
                                        placeholder="Ej. 00-00123456"
                                    />
                                </div>
                                <div>
                                    <label className={labelCls}>Fecha</label>
                                    <input
                                        type="date"
                                        className={fieldCls}
                                        value={fecha}
                                        onChange={(e) => setFecha(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className={labelCls}>Tasa BCV (Bs/USD)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.0001"
                                            className={`${fieldCls} pr-8`}
                                            value={tasaDolar}
                                            onChange={(e) => { setTasaDolar(e.target.value); setTasaFechaBcv(null); }}
                                            placeholder={tasaLoading ? "Consultando BCV…" : "Ej. 46.50"}
                                            disabled={tasaLoading}
                                        />
                                        {tasaLoading && (
                                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-tertiary)] animate-pulse">
                                                ···
                                            </span>
                                        )}
                                    </div>
                                    {tasaFechaBcv && !tasaLoading && (
                                        <p className="mt-1 text-[11px] text-green-500 uppercase tracking-[0.12em]">
                                            BCV {tasaFechaBcv}
                                        </p>
                                    )}
                                    {tasaError && !tasaLoading && (
                                        <p className="mt-1 text-[11px] text-amber-500 uppercase tracking-[0.10em]">
                                            {tasaError} — ingresa manualmente
                                        </p>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className={labelCls}>Notas</label>
                                <textarea
                                    className={`${fieldCls} h-auto py-2`}
                                    rows={2}
                                    value={notas}
                                    onChange={(e) => setNotas(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Productos */}
                        <div className="rounded-xl border border-border-light bg-surface-1 p-6">
                            <div className="mb-5 flex items-center justify-between">
                                <h2 className="text-[14px] font-bold uppercase tracking-[0.12em] text-foreground">
                                    Productos
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => { setQcMode('producto'); setError(null); }}
                                    className="h-8 px-3 text-[11px] uppercase tracking-[0.12em] rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-[var(--text-tertiary)] hover:text-foreground transition-colors"
                                >
                                    + Nuevo producto
                                </button>
                            </div>

                            <FacturaItemsGrid
                                items={items}
                                productos={productos}
                                onChange={setItems}
                                tasaDolar={tasaDolar ? parseFloat(tasaDolar.replace(",", ".")) || null : null}
                                onRequestCreateProducto={(search) => {
                                    setQcProd(p => ({ ...p, nombre: search }));
                                    setQcMode('producto');
                                    setError(null);
                                }}
                            />

                            {/* Totals row */}
                            <div className="mt-4 pt-4 border-t border-border-light flex flex-col items-end gap-1.5 text-[13px]">
                                <div className="flex gap-8 items-center">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Subtotal</span>
                                    <span className="tabular-nums font-medium text-[var(--text-primary)] w-32 text-right">{fmtN(subtotal)}</span>
                                </div>
                                {baseExenta > 0 && (
                                    <div className="flex gap-8 items-center">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base exenta</span>
                                        <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseExenta)}</span>
                                    </div>
                                )}
                                {baseGravada8 > 0 && (
                                    <>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base gravada 8%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseGravada8)}</span>
                                        </div>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA 8%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(iva8)}</span>
                                        </div>
                                    </>
                                )}
                                {baseGravada16 > 0 && (
                                    <>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Base gravada 16%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(baseGravada16)}</span>
                                        </div>
                                        <div className="flex gap-8 items-center">
                                            <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA 16%</span>
                                            <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(iva16)}</span>
                                        </div>
                                    </>
                                )}
                                {ivaMonto > 0 && (
                                    <div className="flex gap-8 items-center">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Total IVA</span>
                                        <span className="tabular-nums text-[var(--text-secondary)] w-32 text-right">{fmtN(ivaMonto)}</span>
                                    </div>
                                )}
                                <div className="flex gap-8 items-center border-t border-border-light pt-1.5">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Total</span>
                                    <span className="tabular-nums font-bold text-foreground w-32 text-right">{fmtN(total)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleSaveDraft}
                                disabled={saving || confirming}
                                className="h-9 px-4 rounded-lg border border-border-medium bg-surface-1 hover:bg-surface-2 disabled:opacity-50 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {saving ? "Guardando…" : "Guardar borrador"}
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={saving || confirming}
                                className="h-9 px-4 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {confirming ? "Confirmando…" : "Confirmar factura"}
                            </button>
                            {savedId && !confirmed && (
                                <span className="text-[11px] text-green-500 uppercase tracking-[0.12em]">
                                    Borrador guardado
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right panel — summary (1/3) */}
                    <div className="w-72 flex-shrink-0 sticky top-6">
                        <div className="rounded-xl border border-border-light bg-surface-1 p-5 space-y-4">
                            <h3 className="text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                                Resumen
                            </h3>
                            <div className="space-y-3 text-[13px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Proveedor</span>
                                    <span className="text-foreground font-medium truncate ml-4 text-right">
                                        {proveedorId
                                            ? proveedores.find((p) => p.id === proveedorId)?.nombre ?? "—"
                                            : "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Fecha</span>
                                    <span className="text-foreground tabular-nums">{fecha || "—"}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Ítems</span>
                                    <span className="text-foreground tabular-nums">{items.filter((i) => i.productoId).length}</span>
                                </div>
                            </div>
                            <div className="pt-3 border-t border-border-light space-y-2 text-[13px]">
                                <div className="flex justify-between">
                                    <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">Subtotal</span>
                                    <span className="tabular-nums text-[var(--text-primary)]">{fmtN(subtotal)}</span>
                                </div>
                                {iva8 > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA 8%</span>
                                        <span className="tabular-nums text-amber-600">{fmtN(iva8)}</span>
                                    </div>
                                )}
                                {iva16 > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-[var(--text-tertiary)] uppercase tracking-[0.12em] text-[11px]">IVA 16%</span>
                                        <span className="tabular-nums text-[var(--text-secondary)]">{fmtN(iva16)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold">
                                    <span className="text-[var(--text-secondary)] uppercase tracking-[0.12em] text-[11px]">Total</span>
                                    <span className="tabular-nums text-foreground">{fmtN(total)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick-create: Proveedor */}
            {qcMode === 'proveedor' && (
                <QuickModal title="Nuevo Proveedor" onClose={() => setQcMode(null)}>
                    <div className="space-y-3">
                        <div>
                            <label className={labelCls}>Nombre *</label>
                            <input
                                autoFocus
                                className={fieldCls}
                                value={qcProv.nombre}
                                onChange={(e) => setQcProv(p => ({ ...p, nombre: e.target.value }))}
                                placeholder="Nombre del proveedor"
                                onKeyDown={(e) => { if (e.key === 'Enter') handleQcProveedor(); }}
                            />
                        </div>
                        <div>
                            <label className={labelCls}>RIF</label>
                            <input
                                className={fieldCls}
                                value={qcProv.rif}
                                onChange={(e) => setQcProv(p => ({ ...p, rif: e.target.value }))}
                                placeholder="J-12345678-9"
                            />
                        </div>
                        {error && <p className="text-[13px] text-red-500">{error}</p>}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setQcMode(null)}
                                className="flex-1 h-9 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleQcProveedor}
                                disabled={qcSaving}
                                className="flex-1 h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {qcSaving ? 'Guardando…' : 'Crear proveedor'}
                            </button>
                        </div>
                    </div>
                </QuickModal>
            )}

            {/* Quick-create: Producto */}
            {qcMode === 'producto' && (
                <QuickModal title="Nuevo Producto" onClose={() => setQcMode(null)}>
                    <div className="space-y-3">
                        <div>
                            <label className={labelCls}>Nombre *</label>
                            <input
                                autoFocus
                                className={fieldCls}
                                value={qcProd.nombre}
                                onChange={(e) => setQcProd(p => ({ ...p, nombre: e.target.value }))}
                                placeholder="Nombre del producto"
                            />
                        </div>
                        <div>
                            <label className={labelCls}>Código</label>
                            <input
                                className={fieldCls}
                                value={qcProd.codigo}
                                onChange={(e) => setQcProd(p => ({ ...p, codigo: e.target.value }))}
                                placeholder="Ej. 001"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelCls}>Tipo</label>
                                <select
                                    className={fieldCls}
                                    value={qcProd.tipo}
                                    onChange={(e) => setQcProd(p => ({ ...p, tipo: e.target.value as TipoProducto }))}
                                >
                                    <option value="mercancia">Mercancía</option>
                                    <option value="materia_prima">Materia Prima</option>
                                    <option value="producto_terminado">Prod. Terminado</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelCls}>IVA</label>
                                <select
                                    className={fieldCls}
                                    value={qcProd.ivaTipo}
                                    onChange={(e) => setQcProd(p => ({ ...p, ivaTipo: e.target.value as IvaTipo }))}
                                >
                                    <option value="general">General (16%)</option>
                                    <option value="exento">Exento</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                            <div>
                                <label className={labelCls}>Departamento</label>
                                <div className="flex gap-1">
                                    <select
                                        className={fieldCls}
                                        value={qcProd.departamentoId}
                                        onChange={(e) => setQcProd(p => ({ ...p, departamentoId: e.target.value }))}
                                    >
                                        <option value="">Sin departamento</option>
                                        {departamentos.filter(d => d.activo).map(d => (
                                            <option key={d.id} value={d.id}>{d.nombre}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setQcDeptOpen(v => !v)}
                                        className="h-9 px-2 flex-shrink-0 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-[var(--text-tertiary)] hover:text-foreground text-[14px] leading-none transition-colors"
                                        title="Crear departamento"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>
                        {qcDeptOpen && (
                            <div className="flex gap-2 items-center px-1 py-2 rounded-lg border border-border-light bg-surface-2">
                                <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)] whitespace-nowrap pl-1">Nuevo depto.</span>
                                <input
                                    autoFocus
                                    className="flex-1 h-8 px-2 rounded-md border border-border-light bg-surface-1 outline-none font-mono text-[12px] text-foreground focus:border-primary-500/60"
                                    value={qcDeptNombre}
                                    onChange={(e) => setQcDeptNombre(e.target.value)}
                                    placeholder="Nombre del departamento"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleQcDepartamento(); if (e.key === 'Escape') setQcDeptOpen(false); }}
                                />
                                <button
                                    onClick={handleQcDepartamento}
                                    disabled={qcDeptSaving || !qcDeptNombre.trim()}
                                    className="h-8 px-4 flex-shrink-0 rounded-md bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[11px] uppercase tracking-[0.12em] transition-colors"
                                >
                                    {qcDeptSaving ? '…' : 'Crear'}
                                </button>
                                <button
                                    onClick={() => setQcDeptOpen(false)}
                                    className="h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-foreground text-[16px] transition-colors"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                        {error && <p className="text-[13px] text-red-500">{error}</p>}
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setQcMode(null)}
                                className="flex-1 h-9 rounded-lg border border-border-medium bg-surface-2 hover:bg-surface-1 text-foreground text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleQcProducto}
                                disabled={qcSaving}
                                className="flex-1 h-9 rounded-lg bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-[12px] uppercase tracking-[0.12em] transition-colors"
                            >
                                {qcSaving ? 'Guardando…' : 'Crear producto'}
                            </button>
                        </div>
                    </div>
                </QuickModal>
            )}
        </div>
    );
}
