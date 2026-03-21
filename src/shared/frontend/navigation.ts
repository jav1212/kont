export const APP_MODULES = [
    { id: "payroll",   label: "Nómina",      href: "/payroll",   desktopOnly: true  },
    { id: "inventory", label: "Inventario",  href: "/inventory", desktopOnly: true  },
    { id: "companies", label: "Empresas",    href: "/companies", desktopOnly: false },
    { id: "billing",   label: "Facturación", href: "/billing",   desktopOnly: false },
] as const;

export type AppModule = typeof APP_MODULES[number];
