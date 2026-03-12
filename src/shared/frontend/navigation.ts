export const APP_MODULES = [
    { id: "payroll", label: "Nómina", href: "/payroll" },
    // { id: "inventory", label: "Inventario", href: "/inventory" },
] as const;

export type AppModule = typeof APP_MODULES[number];
