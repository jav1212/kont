export const APP_MODULES = [
    { id: "payroll",    label: "Nómina",    href: "/payroll"    },
    { id: "companies",  label: "Empresas",  href: "/companies"  },
    { id: "billing",    label: "Facturación", href: "/billing"  },
    // { id: "inventory", label: "Inventario", href: "/inventory" },
] as const;

export type AppModule = typeof APP_MODULES[number];
