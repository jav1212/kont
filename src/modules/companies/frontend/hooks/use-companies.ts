"use client";

import { createContext, useContext } from "react";

export type BusinessSector =
    | 'farmacia' | 'supermercado' | 'panaderia' | 'repuestos'
    | 'ferreteria' | 'restaurante' | 'tienda_ropa' | 'licoreria' | 'otro';

// Re-export taxpayer classification from domain — mirrors SENIAT categories.
export type TaxpayerType = 'ordinario' | 'especial';

export const TAXPAYER_TYPES: readonly TaxpayerType[] = ['ordinario', 'especial'] as const;

export const TAXPAYER_TYPE_LABELS: Record<TaxpayerType, string> = {
    ordinario: 'Contribuyente Ordinario',
    especial:  'Sujeto Pasivo Especial',
};

export interface CustomFieldDefinition {
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select';
    options?: string[];
    required?: boolean;
}

export interface InventoryConfig {
    customFields: CustomFieldDefinition[];
    visibleColumns?: string[];
    defaultMeasureUnit?: string;
    defaultValuationMethod?: string;
}

export interface Company {
    id:              string;
    ownerId:         string;
    name:            string;
    rif?:            string;
    phone?:          string;
    address?:        string;
    contactEmail?:   string;
    logoUrl?:        string;
    showLogoInPdf?:  boolean;
    sector?:         BusinessSector;
    taxpayerType?:   TaxpayerType;
    inventoryConfig?:InventoryConfig;
    createdAt?:      string;
    updatedAt?:      string;
}

export interface CompanyUpdateData {
    name?:           string;
    rif?:            string;
    phone?:          string;
    address?:        string;
    contactEmail?:   string;
    logoUrl?:        string;
    showLogoInPdf?:  boolean;
    sector?:         BusinessSector;
    taxpayerType?:   TaxpayerType;
}

export interface UseCompanyResult {
    companies:          Company[];
    company:            Company | null;
    companyId:          string | null;
    loading:            boolean;
    error:              string | null;
    reload:             () => Promise<void>;
    selectCompany:      (id: string) => void;
    save:               (data: {
        id: string;
        name: string;
        rif?: string;
        taxpayerType?: TaxpayerType;
        phone?: string;
        contactEmail?: string;
        address?: string;
        sector?: BusinessSector;
        logoUrl?: string;
    }) => Promise<string | null>;
    update:             (id: string, data: CompanyUpdateData)              => Promise<string | null>;
    remove:             (id: string)                                       => Promise<string | null>;
    applySector:        (companyId: string, sector: BusinessSector)        => Promise<string | null>;
    getInventoryConfig: (companyId: string) => Promise<InventoryConfig | null>;
    saveInventoryConfig:(companyId: string, config: InventoryConfig) => Promise<string | null>;
}

export const CompanyContext = createContext<UseCompanyResult | null>(null);

/** Reads company data and commands from the committed Web workspace.
 * @returns The active company projection and tenant-scoped commands.
 * @throws Error when called outside WebApplicationProvider.
 */
export function useCompany(): UseCompanyResult {
    const context = useContext(CompanyContext);
    if (!context) throw new Error("useCompany requiere WebApplicationProvider.");
    return context;
}
