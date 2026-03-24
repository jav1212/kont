export interface ConfigFiscal {
    es_contribuyente_especial: boolean;
    porcentaje_retencion_iva: number;        // 75 o 100
    numero_control_siguiente: number;
    numero_retencion_siguiente: number;
    tabla_islr: { concepto: string; porcentaje: number }[];
    contabilidad_activa: boolean;
}

export interface Company {
    id: string;
    ownerId: string;
    name: string;
    rif?: string;
    phone?: string;
    address?: string;
    logoUrl?: string;
    configFiscal?: Partial<ConfigFiscal>;
    createdAt?: Date;
    updatedAt?: Date;
}
