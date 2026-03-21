"use client";

import { BaseTable, Column } from "@/src/shared/frontend/components/base-table";
import { BaseButton } from "@/src/shared/frontend/components/base-button";
import { useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// ============================================================================
// TYPES & DATA (Igual que antes)
// ============================================================================

interface Employee {
    id: string;
    cedula: string;
    nombre: string;
    cargo: string;
    periodo: string;
    salarioMensual: number;
    sueldoQuincena: number;
    bonosQuincena: number;
    totalAsignaciones: number;
    deducciones: number;
    netoPagar: number;
    estado: "activo" | "inactivo" | "vacacion";
}

const empleadosEjemplo: Employee[] = [
    { id: "1", cedula: "V-19998667", nombre: "PEREZ APONTE KAREN YALINEY", cargo: "AUXILIAR", periodo: "Ene 2024", salarioMensual: 130, sueldoQuincena: 47.67, bonosQuincena: 53.33, totalAsignaciones: 101, deducciones: 7.15, netoPagar: 93.85, estado: "activo" },
    { id: "2", cedula: "V-12983113", nombre: "BLANCO FERRER MARIA ELISA", cargo: "AUXILIAR", periodo: "Ene 2024", salarioMensual: 130, sueldoQuincena: 47.67, bonosQuincena: 53.33, totalAsignaciones: 101, deducciones: 7.15, netoPagar: 93.85, estado: "activo" },
    { id: "3", cedula: "V-10203001", nombre: "DA SILVA CRAVO AFRICA ZUZETTY", cargo: "AUXILIAR", periodo: "Ene 2024", salarioMensual: 130, sueldoQuincena: 47.67, bonosQuincena: 53.33, totalAsignaciones: 101, deducciones: 7.15, netoPagar: 93.85, estado: "activo" },
    { id: "4", cedula: "V-20190242", nombre: "NIETO CHIRINOS GERALDINE", cargo: "AUXILIAR", periodo: "Ene 2024", salarioMensual: 130, sueldoQuincena: 47.67, bonosQuincena: 53.33, totalAsignaciones: 101, deducciones: 7.15, netoPagar: 93.85, estado: "inactivo" },
    { id: "5", cedula: "V-15834271", nombre: "PORRO ROMERO EDIBERTH ELLENA", cargo: "AUXILIAR", periodo: "Ene 2024", salarioMensual: 130, sueldoQuincena: 47.67, bonosQuincena: 53.33, totalAsignaciones: 101, deducciones: 7.15, netoPagar: 93.85, estado: "activo" },
    { id: "6", cedula: "V-15758731", nombre: "HENRIQUE ANDRADE KELLYS", cargo: "AUXILIAR", periodo: "Ene 2024", salarioMensual: 130, sueldoQuincena: 47.67, bonosQuincena: 53.33, totalAsignaciones: 101, deducciones: 7.15, netoPagar: 93.85, estado: "vacacion" },
];

const totalNeto = empleadosEjemplo.reduce((acc, e) => acc + e.netoPagar, 0);
const fmt = (n: number) => n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EstadoBadge = ({ estado }: { estado: Employee["estado"] }) => {
    const cfg = {
        activo: { label: "Activo", cls: "text-success bg-success/8 border-success/20" },
        inactivo: { label: "Inactivo", cls: "text-neutral-500 bg-neutral-100 dark:bg-neutral-800 border-border-light" },
        vacacion: { label: "Vacación", cls: "text-warning bg-warning/8 border-warning/20" },
    };
    const { label, cls } = cfg[estado];
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-[11px] uppercase tracking-[0.12em] font-semibold ${cls}`}>
            {label}
        </span>
    );
};

const Stat = ({ label, value, muted }: { label: string; value: string | number; muted?: boolean }) => (
    <div className="flex flex-col gap-0.5">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-600">{label}</span>
        <span className={["font-mono text-[13px] font-bold tabular-nums leading-none", muted ? "text-neutral-500 dark:text-neutral-400" : "text-foreground"].join(" ")}>
            {value}
        </span>
    </div>
);

// ============================================================================
// COMPONENTE DE TABLA (Lógica de hooks aquí)
// ============================================================================

export function PayrollTableView() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const searchValue = searchParams.get("q") ?? "";
    const searchCols = useMemo(() => {
        const raw = searchParams.get("cols");
        return raw ? new Set<string | number>(raw.split(",").filter(Boolean)) : new Set<string | number>();
    }, [searchParams]);

    const updateParams = useCallback(
        (overrides: Record<string, string | null>) => {
            const params = new URLSearchParams(searchParams.toString());
            for (const [key, val] of Object.entries(overrides)) {
                if (!val) params.delete(key);
                else params.set(key, val);
            }
            router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
        },
        [searchParams, router, pathname]
    );

    const handleSearchChange = useCallback((value: string) => updateParams({ q: value }), [updateParams]);
    const handleColsChange = useCallback((cols: Set<string | number>) => updateParams({ cols: Array.from(cols).join(",") || null }), [updateParams]);

    const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(new Set());
    const { sortDescriptor, setSortDescriptor, sortedData } = BaseTable.useSort<Employee>("nombre");

    const columns: Column<Employee>[] = useMemo(() => [
        { key: "cedula", label: "Cédula", sortable: true, searchable: true, width: 148, render: (val) => <span className="font-mono text-[12px] text-neutral-500 dark:text-neutral-400 tabular-nums tracking-wide">{val}</span> },
        { key: "nombre", label: "Empleado", sortable: true, searchable: true, render: (val, item) => (
            <div className="flex flex-col min-w-0">
                <span className="font-mono text-[12px] font-semibold text-foreground truncate leading-none">{val}</span>
                <span className="font-mono text-[11px] text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mt-[3px]">{item.cargo}</span>
            </div>
        )},
        { key: "periodo", label: "Período", width: 100, render: (val) => <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{val}</span> },
        { key: "totalAsignaciones", label: "Asignaciones", align: "end", sortable: true, render: (val) => <span className="font-mono text-[12px] text-neutral-600 dark:text-neutral-400 tabular-nums">Bs. {fmt(Number(val))}</span> },
        { key: "deducciones", label: "Deducciones", align: "end", sortable: true, render: (val) => <span className="font-mono text-[12px] text-error/70 tabular-nums">− {fmt(Number(val))}</span> },
        { key: "netoPagar", label: "Neto a pagar", align: "end", sortable: true, render: (val) => <span className="font-mono text-[13px] font-bold text-foreground tabular-nums">Bs. {fmt(Number(val))}</span> },
        { key: "estado", label: "Estado", align: "center", render: (val) => <EstadoBadge estado={val as Employee["estado"]} /> },
    ], []);

    const sortedEmpleados = useMemo(() => sortedData(empleadosEjemplo), [sortedData]);

    return (
        <div className="min-h-screen bg-background px-6 py-8">
            <div className="max-w-6xl mx-auto space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
                    <div className="space-y-1">
                        <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-neutral-400 dark:text-neutral-600">Recursos Humanos / Nómina</p>
                        <h1 className="font-mono text-xl font-bold text-foreground leading-none">Nómina de Empleados</h1>
                    </div>
                    <BaseButton.Root variant="primary" size="sm">+ Nuevo</BaseButton.Root>
                </div>

                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3.5 rounded-xl bg-surface-1 border border-border-light shadow-[0_1px_2px_rgba(0,0,0,.04)]">
                    <Stat label="Empleados" value={empleadosEjemplo.length} />
                    <span className="hidden sm:block w-px h-7 bg-border-light flex-shrink-0" />
                    <Stat label="Activos" value={empleadosEjemplo.filter(e => e.estado === "activo").length} />
                    <Stat label="Inactivos" value={empleadosEjemplo.filter(e => e.estado === "inactivo").length} muted />
                    <Stat label="Vacaciones" value={empleadosEjemplo.filter(e => e.estado === "vacacion").length} muted />
                    <span className="hidden sm:block w-px h-7 bg-border-light flex-shrink-0" />
                    <Stat label="Período" value="Ene 2024" muted />
                    <Stat label="Neto total" value={`Bs. ${fmt(totalNeto)}`} />
                </div>

                <BaseTable.Render
                    data={sortedEmpleados}
                    columns={columns}
                    keyExtractor={(item) => item.id}
                    enableSearch
                    title="nómina"
                    selectionMode="single"
                    selectedKeys={selectedKeys}
                    onSelectionChange={(keys) => setSelectedKeys(keys as Set<string | number>)}
                    sortDescriptor={sortDescriptor}
                    onSortChange={setSortDescriptor}
                    pagination={{ defaultPageSize: 5, pageSizeOptions: [5, 10, 20] }}
                    searchValue={searchValue}
                    onSearchChange={handleSearchChange}
                    searchColumns={searchCols}
                    onSearchColumnsChange={handleColsChange}
                />
            </div>
        </div>
    );
}