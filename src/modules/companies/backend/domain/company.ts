export interface ConfigFiscal {
    es_contribuyente_especial: boolean;
    porcentaje_retencion_iva: number;        // 75 o 100
    numero_control_siguiente: number;
    numero_retencion_siguiente: number;
    tabla_islr: { concepto: string; porcentaje: number }[];
    contabilidad_activa: boolean;
}

// Business sector — determines the default inventory template for a company.
// Validated at app layer, stored as nullable text in DB (no PG enum).
export type BusinessSector =
    | 'farmacia'
    | 'supermercado'
    | 'panaderia'
    | 'repuestos'
    | 'ferreteria'
    | 'restaurante'
    | 'tienda_ropa'
    | 'licoreria'
    | 'otro';

// All valid sectors for runtime validation and UI rendering.
export const BUSINESS_SECTORS: readonly BusinessSector[] = [
    'farmacia',
    'supermercado',
    'panaderia',
    'repuestos',
    'ferreteria',
    'restaurante',
    'tienda_ropa',
    'licoreria',
    'otro',
] as const;

// Spanish labels for each sector, used in the UI.
export const SECTOR_LABELS: Record<BusinessSector, string> = {
    farmacia:    'Farmacia',
    supermercado:'Supermercado',
    panaderia:   'Panadería',
    repuestos:   'Venta de Repuestos',
    ferreteria:  'Ferretería',
    restaurante: 'Restaurante',
    tienda_ropa: 'Tienda de Ropa',
    licoreria:   'Licorería',
    otro:        'Otro / Personalizado',
};

// Definition of a single custom field that a company can add to its products.
export interface CustomFieldDefinition {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    options?: string[];   // only for type 'select'
    required?: boolean;
}

// Per-company inventory configuration: custom fields, visible columns, defaults.
export interface InventoryConfig {
    customFields: CustomFieldDefinition[];
    visibleColumns?: string[];
    defaultMeasureUnit?: string;
    defaultValuationMethod?: string;
}

export interface Company {
    id: string;
    ownerId: string;
    name: string;
    rif?: string;
    phone?: string;
    address?: string;
    logoUrl?: string;
    showLogoInPdf?: boolean;
    configFiscal?: Partial<ConfigFiscal>;
    sector?: BusinessSector;
    inventoryConfig?: InventoryConfig;
    createdAt?: Date;
    updatedAt?: Date;
}
