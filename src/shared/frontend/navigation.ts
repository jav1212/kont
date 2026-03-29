export const APP_MODULES = [
    { id: "payroll",     label: "Nómina",        href: "/payroll",                desktopOnly: true,  paid: true              },
    { id: "employees",   label: "Empleados",     href: "/payroll/employees",      desktopOnly: false, paid: false, parentId: "payroll" },
    { id: "inventory",   label: "Inventario",    href: "/inventory",              desktopOnly: true,  paid: true              },
    { id: "accounting",  label: "Contabilidad",  href: "/accounting",             desktopOnly: true,  paid: true              },
    { id: "companies",   label: "Empresas",      href: "/companies",              desktopOnly: false, paid: false             },
    { id: "billing",     label: "Facturación",   href: "/billing",                desktopOnly: false, paid: false             },
    { id: "documents",   label: "Documentos",    href: "/documents",              desktopOnly: false, paid: false             },
] as const;

export type AppModule = typeof APP_MODULES[number];
