export const APP_MODULES = [
    { id: "payroll",   label: "Nómina",      href: "/payroll",          desktopOnly: true  },
    { id: "employees", label: "Empleados",   href: "/payroll/employees", desktopOnly: false },
    { id: "inventory", label: "Inventario",  href: "/inventory",        desktopOnly: true  },
    { id: "companies", label: "Empresas",    href: "/companies",        desktopOnly: false },
    { id: "billing",    label: "Facturación", href: "/billing",           desktopOnly: false },
    { id: "documents",  label: "Documentos",  href: "/documents",         desktopOnly: false },
] as const;

export type AppModule = typeof APP_MODULES[number];
