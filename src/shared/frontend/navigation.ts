export const APP_MODULES = [
    { id: "payroll",     label: "Nómina",        href: "/payroll/tablero",        desktopOnly: false, paid: true              },
    { id: "employees",   label: "Empleados",     href: "/payroll/employees",      desktopOnly: false, paid: false, parentId: "payroll" },
    { id: "inventory",   label: "Inventario",    href: "/inventory",              desktopOnly: true,  paid: true              },
    { id: "accounting",  label: "Contabilidad",  href: "/accounting",             desktopOnly: true,  paid: true              },
    { id: "companies",   label: "Empresas",      href: "/companies",              desktopOnly: false, paid: false             },
    { id: "documents",   label: "Documentos",    href: "/documents",              desktopOnly: false, paid: false             },
] as const;

export type AppModule = typeof APP_MODULES[number];

// ── Sub-navigation per module ─────────────────────────────────────────────────
// employees is absorbed into payroll subnav and excluded from the module selector.

export type SubNavItem = { href: string; label: string; group?: string | null };

export const MODULE_SUBNAV: Record<string, SubNavItem[]> = {
    payroll: [
        { href: "/payroll/tablero",           label: "Tablero",       group: null           },
        { href: "/payroll/employees",         label: "Empleados",     group: null           },
        { href: "/payroll",                   label: "Calculadora",   group: "Operaciones"  },
        { href: "/payroll/history",           label: "Historial",     group: "Operaciones"  },
        { href: "/payroll/vacations",         label: "Vacaciones",    group: "Operaciones"  },
        { href: "/payroll/profit-sharing",    label: "Utilidades",    group: "Operaciones"  },
        { href: "/payroll/social-benefits",   label: "Prestaciones",  group: "Operaciones"  },
        { href: "/payroll/liquidations",      label: "Liquidaciones", group: "Operaciones"  },
    ],
    documents: [
        { href: "/documents",       label: "Tablero",  group: null },
        { href: "/documents/files", label: "Archivos", group: null },
    ],
    inventory: [
        { href: "/inventory",                  label: "Tablero",              group: null          },
        { href: "/inventory/products",         label: "Productos",            group: "Catálogos"   },
        { href: "/inventory/suppliers",        label: "Proveedores",          group: "Catálogos"   },
        { href: "/inventory/departments",      label: "Departamentos",        group: "Catálogos"   },
        { href: "/inventory/purchases",        label: "Entradas",             group: "Operaciones" },
        { href: "/inventory/sales",            label: "Salidas",              group: "Operaciones" },
        { href: "/inventory/adjustments",      label: "Ajustes",              group: "Operaciones" },
        { href: "/inventory/returns",          label: "Devoluciones",         group: "Operaciones" },
        { href: "/inventory/self-consumption", label: "Autoconsumo",          group: "Operaciones" },
        { href: "/inventory/production",       label: "Producción",           group: "Operaciones" },
        { href: "/inventory/kardex",           label: "Kardex",               group: "Reportes"    },
        { href: "/inventory/purchase-ledger",  label: "Libro de Entradas",    group: "Reportes"    },
        { href: "/inventory/sales-ledger",     label: "Libro de Salidas",     group: "Reportes"    },
        { href: "/inventory/inventory-ledger", label: "Libro de Inventarios", group: "Reportes"    },
        { href: "/inventory/report",           label: "Reporte Período",      group: "Reportes"    },
        { href: "/inventory/balance-report",   label: "Reporte SALDO",        group: "Reportes"    },
        { href: "/inventory/islr-report",      label: "Reporte ISLR 177",     group: "Reportes"    },
    ],
    accounting: [
        { href: "/accounting",                 label: "Inicio",            group: null             },
        { href: "/accounting/charts",          label: "Planes de cuentas", group: "Configuración"  },
        { href: "/accounting/accounts",        label: "Cuentas",           group: "Configuración"  },
        { href: "/accounting/periods",         label: "Períodos",          group: "Configuración"  },
        { href: "/accounting/integrations",    label: "Integraciones",     group: "Configuración"  },
        { href: "/accounting/journal",         label: "Libro diario",      group: "Contabilidad"   },
        { href: "/accounting/trial-balance",   label: "Balance de sumas",  group: "Contabilidad"   },
    ],
};
