// Sector template definitions for inventory module.
// Pure data — no runtime dependencies. Each template defines default inventory
// configuration for a business sector (departments, custom fields, columns).
// Adding a new sector is a code-only change: add an entry to SECTOR_TEMPLATES.

import type { BusinessSector, CustomFieldDefinition } from '@/src/modules/companies/backend/domain/company';
import type { MeasureUnit, ProductType, ValuationMethod } from './product';

// Shape of a sector-specific inventory template.
export interface SectorTemplate {
  sector: BusinessSector;
  label: string;
  suggestedDepartments: string[];
  suggestedMeasureUnits: MeasureUnit[];
  suggestedProductTypes: ProductType[];
  defaultValuationMethod: ValuationMethod;
  defaultCustomFields: CustomFieldDefinition[];
  visibleColumns: string[];
}

// Master registry of all sector templates.
export const SECTOR_TEMPLATES: Record<BusinessSector, SectorTemplate> = {
  farmacia: {
    sector: 'farmacia',
    label: 'Farmacia',
    suggestedDepartments: [
      'Medicamentos',
      'Perfumería',
      'Misceláneos',
      'Suplementos',
      'Equipos Médicos',
      'Fórmulas Infantiles',
    ],
    suggestedMeasureUnits: ['unidad', 'caja', 'paquete'],
    suggestedProductTypes: ['mercancia'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [
      { key: 'linea', label: 'Línea', type: 'text' },
      { key: 'fecha_ult_compra', label: 'Fecha Últ. Compra', type: 'date' },
      { key: 'fecha_ult_venta', label: 'Fecha Últ. Venta', type: 'date' },
      { key: 'ultimo_proveedor', label: 'Último Proveedor', type: 'text' },
    ],
    visibleColumns: [
      'code', 'name', 'currentStock', 'averageCost',
      'departmentName', 'vatType', 'linea', 'ultimo_proveedor',
    ],
  },

  supermercado: {
    sector: 'supermercado',
    label: 'Supermercado',
    suggestedDepartments: [
      'Alimentos',
      'Bebidas',
      'Limpieza',
      'Higiene Personal',
      'Charcutería',
      'Frutas y Verduras',
      'Panadería',
      'Lácteos',
    ],
    suggestedMeasureUnits: ['unidad', 'kg', 'g', 'litro', 'caja', 'paquete'],
    suggestedProductTypes: ['mercancia'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [
      { key: 'moneda', label: 'Moneda', type: 'select', options: ['Bs', 'USD'] },
      { key: 'tasa_sistema_bancario', label: 'Tasa Sistema Bancario', type: 'number' },
      { key: 'costo_factura', label: 'Costo Factura', type: 'number' },
      { key: 'costo_autoconsumo', label: 'Costo de Autoconsumo', type: 'number' },
    ],
    visibleColumns: [
      'code', 'name', 'departmentName', 'currentStock', 'averageCost',
      'vatType', 'moneda', 'tasa_sistema_bancario', 'costo_factura',
    ],
  },

  panaderia: {
    sector: 'panaderia',
    label: 'Panadería',
    suggestedDepartments: [
      'Pan y Bollería',
      'Pastelería',
      'Bebidas',
      'Insumos',
      'Charcutería',
    ],
    suggestedMeasureUnits: ['unidad', 'kg', 'g', 'litro', 'caja'],
    suggestedProductTypes: ['mercancia', 'materia_prima', 'producto_terminado'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [
      { key: 'tipo_producto', label: 'Tipo de Producto', type: 'select', options: ['Elaboración propia', 'Reventa'] },
      { key: 'fecha_vencimiento', label: 'Fecha de Vencimiento', type: 'date' },
    ],
    visibleColumns: [
      'code', 'name', 'departmentName', 'currentStock', 'averageCost',
      'vatType', 'type', 'tipo_producto',
    ],
  },

  repuestos: {
    sector: 'repuestos',
    label: 'Venta de Repuestos',
    suggestedDepartments: [
      'Motor',
      'Frenos',
      'Suspensión',
      'Eléctrico',
      'Carrocería',
      'Aceites y Lubricantes',
      'Filtros',
    ],
    suggestedMeasureUnits: ['unidad', 'caja', 'litro', 'kg'],
    suggestedProductTypes: ['mercancia'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [
      { key: 'marca', label: 'Marca', type: 'text' },
      { key: 'modelo_vehiculo', label: 'Modelo de Vehículo', type: 'text' },
      { key: 'numero_parte', label: 'Número de Parte', type: 'text' },
      { key: 'ubicacion', label: 'Ubicación en Almacén', type: 'text' },
    ],
    visibleColumns: [
      'code', 'name', 'departmentName', 'currentStock', 'averageCost',
      'vatType', 'marca', 'numero_parte',
    ],
  },

  ferreteria: {
    sector: 'ferreteria',
    label: 'Ferretería',
    suggestedDepartments: [
      'Herramientas',
      'Electricidad',
      'Plomería',
      'Pintura',
      'Construcción',
      'Tornillería',
    ],
    suggestedMeasureUnits: ['unidad', 'kg', 'm', 'litro', 'rollo', 'caja'],
    suggestedProductTypes: ['mercancia'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [
      { key: 'marca', label: 'Marca', type: 'text' },
      { key: 'ubicacion', label: 'Ubicación en Almacén', type: 'text' },
    ],
    visibleColumns: [
      'code', 'name', 'departmentName', 'currentStock', 'averageCost',
      'vatType', 'measureUnit', 'marca',
    ],
  },

  restaurante: {
    sector: 'restaurante',
    label: 'Restaurante',
    suggestedDepartments: [
      'Carnes',
      'Vegetales',
      'Lácteos',
      'Bebidas',
      'Condimentos',
      'Desechables',
    ],
    suggestedMeasureUnits: ['unidad', 'kg', 'g', 'litro', 'caja'],
    suggestedProductTypes: ['materia_prima', 'mercancia'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [
      { key: 'proveedor_habitual', label: 'Proveedor Habitual', type: 'text' },
      { key: 'requiere_refrigeracion', label: 'Requiere Refrigeración', type: 'select', options: ['Sí', 'No'] },
    ],
    visibleColumns: [
      'code', 'name', 'departmentName', 'currentStock', 'averageCost',
      'vatType', 'measureUnit', 'proveedor_habitual',
    ],
  },

  tienda_ropa: {
    sector: 'tienda_ropa',
    label: 'Tienda de Ropa',
    suggestedDepartments: [
      'Caballeros',
      'Damas',
      'Niños',
      'Calzado',
      'Accesorios',
    ],
    suggestedMeasureUnits: ['unidad', 'paquete'],
    suggestedProductTypes: ['mercancia'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [
      { key: 'talla', label: 'Talla', type: 'text' },
      { key: 'color', label: 'Color', type: 'text' },
      { key: 'marca', label: 'Marca', type: 'text' },
    ],
    visibleColumns: [
      'code', 'name', 'departmentName', 'currentStock', 'averageCost',
      'vatType', 'talla', 'color', 'marca',
    ],
  },

  licoreria: {
    sector: 'licoreria',
    label: 'Licorería',
    suggestedDepartments: [
      'Cervezas',
      'Vinos',
      'Licores',
      'Bebidas sin Alcohol',
      'Snacks',
      'Hielo',
    ],
    suggestedMeasureUnits: ['unidad', 'caja', 'litro', 'paquete'],
    suggestedProductTypes: ['mercancia'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [
      { key: 'marca', label: 'Marca', type: 'text' },
      { key: 'contenido_ml', label: 'Contenido (ml)', type: 'number' },
      { key: 'graduacion', label: 'Graduación Alcohólica', type: 'text' },
    ],
    visibleColumns: [
      'code', 'name', 'departmentName', 'currentStock', 'averageCost',
      'vatType', 'marca', 'contenido_ml',
    ],
  },

  otro: {
    sector: 'otro',
    label: 'Otro / Personalizado',
    suggestedDepartments: [],
    suggestedMeasureUnits: ['unidad', 'kg', 'litro', 'caja'],
    suggestedProductTypes: ['mercancia', 'materia_prima', 'producto_terminado'],
    defaultValuationMethod: 'promedio_ponderado',
    defaultCustomFields: [],
    visibleColumns: ['code', 'name', 'currentStock', 'averageCost', 'vatType'],
  },
};

// Retrieve the template for a given sector, falling back to "otro".
export function getSectorTemplate(sector: BusinessSector): SectorTemplate {
  return SECTOR_TEMPLATES[sector] ?? SECTOR_TEMPLATES.otro;
}
