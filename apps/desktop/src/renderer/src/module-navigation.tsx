import {
  Activity, Archive, ArrowRightLeft, BarChart3, BookOpen, Boxes, Building2,
  Calculator, CalendarDays, DollarSign, FileText, Files, Gauge, HandCoins,
  History, Landmark, Package, PenLine, Settings, ShoppingCart, Truck, Upload,
  UserMinus, Users, WalletCards, Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import type { WorkspaceSidebarSection } from "@kontave/ui-dom";

interface NavigationItemSpec {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly group?: string;
  readonly beta?: boolean;
}

const NAVIGATION: Readonly<Record<string, readonly NavigationItemSpec[]>> = {
  payroll: [
    { id: "/payroll/tablero", label: "Tablero", icon: <Gauge /> },
    { id: "/payroll/employees", label: "Empleados", icon: <Users /> },
    { id: "/payroll/settings", label: "Configuración", icon: <Settings /> },
    { id: "/payroll", label: "Calculadora", icon: <Calculator />, group: "Operaciones" },
    { id: "/payroll/vacations", label: "Vacaciones", icon: <CalendarDays />, group: "Operaciones", beta: true },
    { id: "/payroll/profit-sharing", label: "Utilidades", icon: <HandCoins />, group: "Operaciones", beta: true },
    { id: "/payroll/social-benefits", label: "Prestaciones", icon: <Landmark />, group: "Operaciones", beta: true },
    { id: "/payroll/liquidations", label: "Liquidaciones", icon: <UserMinus />, group: "Operaciones", beta: true },
    { id: "/payroll/ari", label: "AR-I (ISLR)", icon: <FileText />, group: "Operaciones", beta: true },
    { id: "/payroll/history", label: "Historial", icon: <History />, group: "Histórico" },
  ],
  purchases: [
    { id: "/purchases", label: "Tablero", icon: <Gauge /> },
    { id: "/purchases/suppliers", label: "Proveedores", icon: <Truck />, group: "Catálogos" },
    { id: "/purchases/import-book", label: "Importar libro", icon: <Upload />, group: "Operaciones" },
    { id: "/purchases/archive", label: "Archivo de facturas", icon: <Archive />, group: "Operaciones" },
  ],
  sales: [
    { id: "/sales", label: "Tablero", icon: <Gauge /> },
    { id: "/sales/pos", label: "Punto de venta", icon: <ShoppingCart />, group: "Operaciones" },
    { id: "/sales/customers", label: "Clientes", icon: <Users />, group: "Catálogos" },
    { id: "/sales/archive", label: "Archivo de facturas", icon: <Archive />, group: "Operaciones" },
    { id: "/sales/igtf-fortnightly", label: "IGTF Quincenal", icon: <FileText />, group: "Reportes" },
  ],
  inventory: [
    { id: "/inventory", label: "Tablero", icon: <Gauge /> },
    { id: "/inventory/products", label: "Productos", icon: <Package />, group: "Catálogos" },
    { id: "/inventory/departments", label: "Departamentos", icon: <Building2 />, group: "Catálogos" },
    { id: "/inventory/sales", label: "Salidas", icon: <Boxes />, group: "Operaciones" },
    { id: "/inventory/operations", label: "Operaciones", icon: <ArrowRightLeft />, group: "Operaciones" },
    { id: "/inventory/purchase-ledger", label: "Libro de Entradas", icon: <BookOpen />, group: "Reportes" },
    { id: "/inventory/sales-ledger", label: "Libro de Salidas", icon: <BookOpen />, group: "Reportes" },
    { id: "/inventory/report", label: "Reporte de período", icon: <BarChart3 />, group: "Reportes" },
  ],
  accounting: [
    { id: "/accounting", label: "Inicio", icon: <Gauge /> },
    { id: "/accounting/charts", label: "Planes de cuentas", icon: <BookOpen />, group: "Configuración" },
    { id: "/accounting/accounts", label: "Cuentas", icon: <WalletCards />, group: "Configuración" },
    { id: "/accounting/periods", label: "Períodos", icon: <CalendarDays />, group: "Configuración" },
    { id: "/accounting/journal", label: "Libro diario", icon: <PenLine />, group: "Contabilidad" },
    { id: "/accounting/trial-balance", label: "Balance de sumas", icon: <BarChart3 />, group: "Contabilidad" },
    { id: "/accounting/financial-statements", label: "Estados financieros", icon: <FileText />, group: "Reportes" },
  ],
  tools: [
    { id: "/tools", label: "Tablero", icon: <Wrench /> },
    { id: "/tools/divisas", label: "Divisas BCV", icon: <DollarSign />, group: "Conversores" },
    { id: "/tools/calendario-seniat", label: "Calendario SENIAT", icon: <CalendarDays />, group: "Calendarios" },
    { id: "/tools/status", label: "Estado de portales", icon: <Activity />, group: "Monitoreo" },
  ],
  companies: [
    { id: "/companies", label: "Empresas", icon: <Building2 /> },
  ],
  documents: [
    { id: "/documents", label: "Tablero", icon: <Gauge /> },
    { id: "/documents/files", label: "Archivos", icon: <Files /> },
    { id: "/documents/contracts", label: "Contratos", icon: <FileText />, group: "Generador" },
  ],
};

export function moduleNavigationSections(moduleId: string | null, activeItemId: string | null): readonly WorkspaceSidebarSection[] {
  const items = moduleId ? NAVIGATION[moduleId] ?? [] : [];
  const groups = new Map<string, NavigationItemSpec[]>();
  for (const item of items) {
    const group = item.group ?? "";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return [...groups.entries()].map(([group, entries], index) => ({
    id: `${moduleId ?? "module"}-${group || "root"}`,
    ...(group ? { label: group } : {}),
    items: entries.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      active: item.id === activeItemId,
      ...(item.beta ? { badge: "BETA" } : {}),
      ...(index > 0 && item === entries[0] ? { startsGroup: true } : {}),
    })),
  }));
}

export function defaultModuleNavigationItem(moduleId: string | null): string | null {
  return moduleId ? NAVIGATION[moduleId]?.[0]?.id ?? null : null;
}

export function moduleNavigationLabel(moduleId: string | null, itemId: string | null): string {
  return moduleId && itemId ? NAVIGATION[moduleId]?.find((item) => item.id === itemId)?.label ?? "Dispositivos" : "Dispositivos";
}
