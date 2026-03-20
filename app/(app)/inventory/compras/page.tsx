"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useCompany } from "@/src/modules/companies/frontend/hooks/use-companies";
import { useInventory } from "@/src/modules/inventory/frontend/hooks/use-inventory";
import type { EstadoFactura } from "@/src/modules/inventory/backend/domain/factura-compra";

// ── helpers ──────────────────────────────────────────────────────────────────

const fmtN = (n: number) =>
    n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("T")[0].split("-");
    return `${day}/${m}/${y}`;
};

function EstadoBadge({ estado }: { estado: EstadoFactura }) {
    if (estado === "confirmada") {
        return (
            <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.12em] font-medium bg-green-500/10 text-green-600">
                Confirmada
            </span>
        );
    }
    return (
        <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] uppercase tracking-[0.12em] font-medium bg-amber-500/10 text-amber-600">
            Borrador
        </span>
    );
}

// ── component ─────────────────────────────────────────────────────────────────

export default function ComprasPage() {
    const { companyId } = useCompany();
    const { facturas, loadingFacturas, error, loadFacturas } = useInventory();

    useEffect(() => {
        if (companyId) loadFacturas(companyId);
    }, [companyId, loadFacturas]);

    return (
        <div className="min-h-full bg-surface-2 font-mono">
            {/* Header */}
            <div className="px-8 py-6 border-b border-border-light bg-surface-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[13px] font-bold uppercase tracking-[0.18em] text-foreground">
                            Facturas de Compra
                        </h1>
                        <p className="text-[10px] text-foreground/40 uppercase tracking-[0.16em] mt-0.5">
                            Registro de compras a proveedores
                        </p>
                    </div>
                    <Link
                        href="/inventory/compras/nueva"
                        className="h-8 px-3 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-[11px] uppercase tracking-[0.14em] transition-colors inline-flex items-center"
                    >
                        + Nueva factura
                    </Link>
                </div>
            </div>

            <div className="px-8 py-6 space-y-4">
                {/* Error */}
                {error && (
                    <div className="px-4 py-3 rounded-lg border border-red-500/20 bg-red-500/[0.05] text-red-500 text-[11px]">
                        {error}
                    </div>
                )}

                {/* Table */}
                <div className="rounded-xl border border-border-light bg-surface-1 overflow-hidden">
                    {loadingFacturas ? (
                        <div className="px-5 py-8 text-center text-[11px] text-foreground/40">Cargando…</div>
                    ) : facturas.length === 0 ? (
                        <div className="px-5 py-8 text-center text-[11px] text-foreground/40">
                            No hay facturas. Haz clic en &quot;+ Nueva factura&quot; para crear una.
                        </div>
                    ) : (
                        <table className="w-full text-[11px]">
                            <thead>
                                <tr className="border-b border-border-light">
                                    {["Fecha", "Proveedor", "Nº Factura", "Subtotal", "IVA", "Total", "Estado", ""].map((h) => (
                                        <th key={h} className="px-4 py-2.5 text-left text-[9px] uppercase tracking-[0.18em] text-foreground/40 font-normal whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {facturas.map((f) => (
                                    <tr key={f.id} className="border-b border-border-light/50 hover:bg-surface-2 transition-colors">
                                        <td className="px-4 py-2.5 text-foreground/60 tabular-nums">{fmtDate(f.fecha)}</td>
                                        <td className="px-4 py-2.5 text-foreground font-medium">{f.proveedorNombre ?? "—"}</td>
                                        <td className="px-4 py-2.5 text-foreground/60">{f.numeroFactura || "—"}</td>
                                        <td className="px-4 py-2.5 tabular-nums text-foreground/80">{fmtN(f.subtotal)}</td>
                                        <td className="px-4 py-2.5 tabular-nums text-foreground/60">{fmtN(f.ivaMonto)}</td>
                                        <td className="px-4 py-2.5 tabular-nums font-medium text-foreground">{fmtN(f.total)}</td>
                                        <td className="px-4 py-2.5"><EstadoBadge estado={f.estado} /></td>
                                        <td className="px-4 py-2.5">
                                            <Link
                                                href={`/inventory/compras/${f.id}`}
                                                className="text-[9px] uppercase tracking-[0.12em] text-primary-500 hover:text-primary-600 transition-colors"
                                            >
                                                Ver
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
