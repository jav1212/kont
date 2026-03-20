export const APP_MODULES = [
    { id: "payroll",    label: "Nómina",      href: "/payroll"    },
    { id: "inventory",  label: "Inventario",  href: "/inventory"  },
    { id: "companies",  label: "Empresas",    href: "/companies"  },
    { id: "billing",    label: "Facturación", href: "/billing"    },
] as const;

export type AppModule = typeof APP_MODULES[number];
