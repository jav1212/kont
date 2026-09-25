export const APP_MODULES = [
    { id: "payroll",     label: "Nómina",        href: "/payroll/tablero",        paid: true              },
    { id: "employees",   label: "Empleados",     href: "/payroll/employees",      paid: false, parentId: "payroll" },
    { id: "purchases",   label: "Compras",       href: "/purchases",              paid: true              },
    { id: "sales",       label: "Ventas",        href: "/sales",                  paid: true              },
    { id: "inventory",   label: "Inventario",    href: "/inventory",              paid: true              },
    { id: "accounting",  label: "Contabilidad",  href: "/accounting",             paid: true              },
    { id: "tools",       label: "Herramientas",  href: "/tools",                  paid: false             },
    { id: "companies",   label: "Empresas",      href: "/companies",              paid: false             },
    { id: "documents",   label: "Documentos",    href: "/documents",              paid: false             },
] as const;

export type AppModule = typeof APP_MODULES[number];

/**
 * Web-only navigation surface for settings. It deliberately does not enter
 * APP_MODULES because it is not a workspace module that can be installed.
 */
export const WEB_SETTINGS_MODULE = {
    id: "settings",
    label: "Configuración",
    href: "/settings/organization",
} as const;

// ── Sub-navigation per module ─────────────────────────────────────────────────
// employees is absorbed into payroll subnav and excluded from the module selector.

export type SubNavItem = {
    href: string;
    label: string;
    group?: string | null;
    beta?: boolean;
    icon?: string;
    subtitle?: string;
};

export const MODULE_SUBNAV: Record<string, SubNavItem[]> = {
    payroll: [
        { href: "/payroll/tablero",           label: "Tablero",       group: null                         },
        { href: "/payroll/employees",         label: "Empleados",     group: null                         },
        { href: "/payroll/settings",          label: "Configuraci\u00f3n", group: null                         },
        { href: "/payroll",                   label: "Calculadora",   group: "Operaciones"                },
        { href: "/payroll/vacations",         label: "Vacaciones",    group: "Operaciones", beta: true    },
        { href: "/payroll/profit-sharing",    label: "Utilidades",    group: "Operaciones", beta: true    },
        { href: "/payroll/social-benefits",   label: "Prestaciones",  group: "Operaciones", beta: true    },
        { href: "/payroll/liquidations",      label: "Liquidaciones", group: "Operaciones", beta: true    },
        { href: "/payroll/ari",               label: "AR-I (ISLR)",   group: "Operaciones", beta: true    },
        { href: "/payroll/history",           label: "Historial",     group: "Histórico"                  },
    ],
    documents: [
        { href: "/documents",            label: "Tablero",   group: null        },
        { href: "/documents/files",      label: "Archivos",  group: null        },
        { href: "/documents/contracts",  label: "Contratos", group: "Generador" },
    ],
    purchases: [
        { href: "/purchases",                 label: "Tablero",             group: null          },
        { href: "/purchases/suppliers",       label: "Proveedores",         group: "Catálogos"   },
        { href: "/purchases/import-book",     label: "Importar libro",       group: "Operaciones" },
        { href: "/purchases/archive",         label: "Archivo de facturas", group: "Operaciones" },
    ],
    sales: [
        { href: "/sales",                  label: "Tablero",             group: null          },
        { href: "/sales/pos",              label: "Punto de venta",      group: "Operaciones" },
        { href: "/sales/receivables",      label: "Cuentas por cobrar", group: "Operaciones" },
        { href: "/sales/customers",        label: "Clientes",            group: "Catálogos"   },
        { href: "/sales/archive",          label: "Archivo de facturas", group: "Operaciones" },
        { href: "/sales/igtf-fortnightly", label: "IGTF Quincenal",      group: "Reportes"    },
    ],
    inventory: [
        { href: "/inventory",                  label: "Tablero",              group: null          },
        { href: "/inventory/products",         label: "Productos",            group: "Catálogos"   },
        { href: "/inventory/departments",      label: "Departamentos",        group: "Catálogos"   },
        { href: "/inventory/sales",            label: "Salidas",              group: "Operaciones" },
        { href: "/inventory/operations",       label: "Operaciones",          group: "Operaciones" },
        { href: "/inventory/compras-pendientes", label: "Compras pendientes", group: "Operaciones" },
        { href: "/inventory/purchase-ledger",  label: "Libro de Entradas",    group: "Reportes"    },
        { href: "/inventory/sales-ledger",     label: "Libro de Salidas",     group: "Reportes"    },
        { href: "/inventory/inventory-ledger", label: "Libro de Inventarios", group: "Reportes"    },
        { href: "/inventory/report",           label: "Reporte Período",      group: "Reportes"    },
        { href: "/inventory/balance-report",   label: "Reporte SALDO",        group: "Reportes"    },
        { href: "/inventory/islr-report",      label: "Reporte ISLR 177",     group: "Reportes"    },
    ],
    accounting: [
        { href: "/accounting",                       label: "Inicio",               group: null             },
        { href: "/accounting/charts",                label: "Planes de cuentas",    group: "Configuración"  },
        { href: "/accounting/accounts",              label: "Cuentas",              group: "Configuración"  },
        { href: "/accounting/periods",               label: "Períodos",             group: "Configuración"  },
        { href: "/accounting/integrations",          label: "Integraciones",        group: "Configuración"  },
        { href: "/accounting/journal",               label: "Libro diario",         group: "Contabilidad"   },
        { href: "/accounting/trial-balance",         label: "Balance de sumas",     group: "Contabilidad"   },
        { href: "/accounting/financial-statements",  label: "Estados Financieros",  group: "Reportes"       },
    ],
    tools: [
        { href: "/tools",                   label: "Tablero",           group: null             },
        { href: "/tools/divisas",           label: "Divisas BCV",       group: "Conversores"    },
        { href: "/tools/calendario-seniat", label: "Calendario SENIAT", group: "Calendarios"    },
        { href: "/tools/status",            label: "Estatus Portales",  group: "Monitoreo"      },
    ],
    settings: [
        { href: "/settings/organization", label: "Configuración general", group: "Organización", icon: "building", subtitle: "Administra la identidad, empresas y personas de tu organización." },
        { href: "/settings/members", label: "Miembros", group: "Organización", icon: "users", subtitle: "Personas e invitaciones del espacio de trabajo." },
        { href: "/settings/roles", label: "Roles", group: "Organización", icon: "shield", subtitle: "Ajusta los permisos de cada rol del sistema." },
        { href: "/settings/access", label: "Acceso", group: "Organización", icon: "barcode", subtitle: "Terminales y carnets para iniciar sesión con lector." },
        { href: "/settings/billing", label: "Facturación", group: "Organización", icon: "credit-card", subtitle: "Plan activo, pagos y solicitudes de suscripción." },
        { href: "/settings/referrals", label: "Referidos", group: "Organización", icon: "gift", subtitle: "Invita a otros profesionales y gana crédito." },
        { href: "/settings/company", label: "Datos de empresa", group: "Empresa", icon: "building", subtitle: "Datos fiscales y opciones de los reportes PDF." },
        { href: "/settings/inventory-config", label: "Inventario", group: "Empresa", icon: "boxes", subtitle: "Campos personalizados visibles en productos." },
        { href: "/profile", label: "Mi perfil", group: "Cuenta personal", icon: "user", subtitle: "Tus datos personales y el estado de tu cuenta." },
        { href: "/settings/apariencia", label: "Apariencia", group: "Cuenta personal", icon: "palette", subtitle: "Tema y preferencias visuales de este navegador." },
        { href: "/settings/instalar-app", label: "Instalar app", group: "Cuenta personal", icon: "download", subtitle: "Cómo agregar Konta a Windows, macOS, Android o iOS." },
        { href: "/settings/devices", label: "Dispositivos", group: "Cuenta personal", icon: "monitor", subtitle: "Conecta lectores y equipos locales con Kontave." },
    ],
};
