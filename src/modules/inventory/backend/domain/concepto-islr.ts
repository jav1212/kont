// =============================================================================
// Catálogo de Conceptos de Retención de ISLR (Anexo 6.1 — Decreto 1808)
//
// Tabla completa de los 86 códigos de concepto exigidos por SENIAT en el XML
// `<RelacionRetencionesISLR>`. Base legal: Decreto Reglamentario 1.808 sobre
// Retenciones del Impuesto Sobre la Renta (G.O. 36.203, 12/05/1997). Spec
// técnica: manual SENIAT 60.40.40.039 (DMT_01ESP_TEC v2.3, Feb 2010).
//
// Reglas de cálculo (Art. 9):
//
//   1. PNR (Persona Natural Residente) — aplica fórmula con sustraendo:
//        Retención = (Monto × %) − (UT × % × 83.3334)
//      Códigos PNR: 002, 006, 010, 012, 014, 018, 025, 049, 053, 057, 061,
//      071, 073, 075, 077, 079, 083.
//      Si el resultado < 0, no se retiene (cero).
//
//   2. PNNR (Persona Natural No Residente) — 34% fijo sobre todo pago, sin
//      mínimo ni sustraendo. Ciertos conceptos aplican % efectivo distinto
//      (regalías, intereses al exterior, etc.).
//
//   3. PJD (Persona Jurídica Domiciliada) — porcentaje fijo (1/2/3/5%) con
//      mínimo en Bs por debajo del cual NO se retiene:
//        · 5% → mínimo Bs. 1.250
//        · 3% → mínimo Bs.   750
//        · 1% y 2% → sin mínimo
//      Excepción (Art. 9 §2): conceptos de juegos/apuestas (#41-44),
//      tarjetas de crédito (#65-70) y enajenación acciones bolsa están
//      exentos del mínimo.
//
//   4. PJND (Persona Jurídica No Domiciliada) — tramos progresivos sobre
//      base en U.T. (Art. 9 Parágrafo Primero):
//        ·  15% hasta 2.000 U.T.
//        ·  22% entre 2.000 y 3.000 U.T.
//        ·  34% sobre el exceso de 3.000 U.T.
//      Aplica a literal a)num1, literales a-c)num3, num4, 5, 6, 7, 11, 12.
//
// Para v1 del módulo KONT incluimos:
//   · Cálculo del sustraendo automático para los 17 códigos PNR.
//   · Validación de mínimo Bs para PJD 5% y 3%.
//   · Tramos progresivos PJND quedan diferidos (raros en compras locales,
//     se manejan caso por caso vía configuración manual del % por concepto).
// =============================================================================

export type IslrTaxpayerType = 'PNR' | 'PNNR' | 'PJD' | 'PJND';

export interface IslrConcept {
    /** Código de 3 dígitos del Anexo 6.1 (ej. "002"). */
    code:              string;
    /** Descripción legal del concepto. */
    description:       string;
    /** Categoría del beneficiario. */
    taxpayerType:      IslrTaxpayerType;
    /** Alícuota base. Para PJND con tramos, 0 (configurable manualmente). */
    percentage:        number;
    /** Aplica fórmula del sustraendo (Decreto 1808 Art. 9 §2). */
    appliesSustraendo: boolean;
    /**
     * Mínimo en Bs por debajo del cual no se retiene (PJD 3% / 5%).
     * undefined cuando no aplica mínimo (1%, 2%, PNR, PNNR).
     */
    minThresholdBs?:   number;
    /** PJND con tarifa progresiva 15/22/34% — diferida en v1. */
    progressiveTariff: boolean;
    /** Notas legales adicionales (% efectivo cuando aplica sobre porción). */
    notes?:            string;
}

// ── Catálogo (86 conceptos) ──────────────────────────────────────────────────

export const ISLR_CONCEPTS: IslrConcept[] = [
    // 001 — Sueldos y salarios (gestionado por nómina, no por compras).
    { code: '001', description: 'Sueldos y Salarios',                                 taxpayerType: 'PNR',  percentage: 0,    appliesSustraendo: false, progressiveTariff: false, notes: 'Calculado por AR-I — usar módulo de nómina' },

    // Honorarios profesionales no mercantiles (art. 9 num.1)
    { code: '002', description: 'Honorarios Profesionales No Mercantiles (PNR)',       taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '003', description: 'Honorarios Profesionales No Mercantiles (PNNR)',      taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false, notes: '34% sobre 90% del pago = efectivo 30,6%' },
    { code: '004', description: 'Honorarios Profesionales No Mercantiles (PJD)',       taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '005', description: 'Honorarios Profesionales No Mercantiles (PJND)',      taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Honorarios mancomunados (art. 9 num.2 lit.f)
    { code: '006', description: 'Honorarios Mancomunados (PNR)',                       taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '007', description: 'Honorarios Mancomunados (PNNR)',                      taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '008', description: 'Honorarios Mancomunados (PJD)',                       taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '009', description: 'Honorarios Mancomunados (PJND)',                      taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Honorarios a jinetes/veterinarios/preparadores
    { code: '010', description: 'Honorarios Jinetes/Veterinarios/Preparadores (PNR)',  taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '011', description: 'Honorarios Jinetes/Veterinarios/Preparadores (PNNR)', taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },

    // Honorarios pagados por clínicas/hospitales/bufetes (art. 9 num.1 lit.g)
    { code: '012', description: 'Honorarios pagados por Clínicas/Bufetes a profesionales (PNR)',  taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '013', description: 'Honorarios pagados por Clínicas/Bufetes a profesionales (PNNR)', taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },

    // Comisiones venta de bienes inmuebles (art. 9 num.2 lit.a)
    { code: '014', description: 'Comisiones venta de bienes inmuebles (PNR)',          taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '015', description: 'Comisiones venta de bienes inmuebles (PNNR)',         taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '016', description: 'Comisiones venta de bienes inmuebles (PJD)',          taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '017', description: 'Comisiones venta de bienes inmuebles (PJND)',         taxpayerType: 'PJND', percentage: 5,    appliesSustraendo: false, progressiveTariff: false },

    // Otras comisiones (art. 9 num.2 lit.b)
    { code: '018', description: 'Otras comisiones (PNR)',                              taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '019', description: 'Otras comisiones (PNNR)',                             taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '020', description: 'Otras comisiones (PJD)',                              taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '021', description: 'Otras comisiones (PJND)',                             taxpayerType: 'PJND', percentage: 5,    appliesSustraendo: false, progressiveTariff: false },

    // Intereses de capitales (art. 9 num.3)
    { code: '022', description: 'Intereses de capitales prestados invertidos en producción de renta (PNNR)', taxpayerType: 'PNNR', percentage: 34, appliesSustraendo: false, progressiveTariff: false, notes: '34% sobre 95% = efectivo 32,3%' },
    { code: '023', description: 'Intereses de capitales prestados invertidos en producción de renta (PJND)', taxpayerType: 'PJND', percentage: 0,  appliesSustraendo: false, progressiveTariff: true },
    { code: '024', description: 'Intereses préstamos a inst. financieras del exterior no domiciliadas (PJND)', taxpayerType: 'PJND', percentage: 4.95, appliesSustraendo: false, progressiveTariff: false, notes: 'Tasa fija 4,95%' },
    { code: '025', description: 'Intereses pagados por PJ/comunidades a otros (PNR)',  taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '026', description: 'Intereses pagados por PJ/comunidades a otros (PNNR)', taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '027', description: 'Intereses pagados por PJ/comunidades a otros (PJD)',  taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '028', description: 'Intereses pagados por PJ/comunidades a otros (PJND)', taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Enriquecimientos agencias internacionales (art. 9 num.4)
    { code: '029', description: 'Enriquecimientos Netos Agencias Internacionales (PJND)',           taxpayerType: 'PJND', percentage: 0,  appliesSustraendo: false, progressiveTariff: true,  notes: '34% sobre 15% = efectivo 5,1%' },

    // Fletes transporte internacional (art. 9 num.5)
    { code: '030', description: 'Fletes Transporte Internacional (PNNR)',              taxpayerType: 'PNNR', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },
    { code: '031', description: 'Fletes Transporte Internacional (PJND)',              taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Películas cine/TV (art. 9 num.6)
    { code: '032', description: 'Exhibición Películas Cine/TV (PNNR)',                 taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false, notes: '34% sobre 25% = efectivo 8,5%' },
    { code: '033', description: 'Exhibición Películas Cine/TV (PJND)',                 taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Regalías (art. 9 num.7 lit.a)
    { code: '034', description: 'Regalías y participaciones análogas (PNNR)',          taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false, notes: '34% sobre 90%' },
    { code: '035', description: 'Regalías y participaciones análogas (PJND)',          taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Asistencia técnica (art. 9 num.7 lit.b)
    { code: '036', description: 'Asistencia Técnica (PNNR)',                           taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false, notes: '34% sobre 30%' },
    { code: '037', description: 'Asistencia Técnica (PJND)',                           taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Servicios tecnológicos (art. 9 num.7 lit.c)
    { code: '038', description: 'Servicios Tecnológicos (PNNR)',                       taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false, notes: '34% sobre 50%' },
    { code: '039', description: 'Servicios Tecnológicos (PJND)',                       taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Primas de seguros (art. 9 num.8)
    { code: '040', description: 'Primas de Seguros y Reaseguros (PJND)',               taxpayerType: 'PJND', percentage: 10,   appliesSustraendo: false, progressiveTariff: false, notes: '10% sobre 30% = efectivo 3%' },

    // Juegos y apuestas (art. 9 num.9)
    { code: '041', description: 'Juegos y Apuestas (PNR)',                             taxpayerType: 'PNR',  percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '042', description: 'Juegos y Apuestas (PNNR)',                            taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '043', description: 'Juegos y Apuestas (PJD)',                             taxpayerType: 'PJD',  percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '044', description: 'Juegos y Apuestas (PJND)',                            taxpayerType: 'PJND', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },

    // Premios loterías/hipódromos
    { code: '045', description: 'Premios Loterías/Hipódromos (PNR)',                   taxpayerType: 'PNR',  percentage: 16,   appliesSustraendo: false, progressiveTariff: false },
    { code: '046', description: 'Premios Loterías/Hipódromos (PNNR)',                  taxpayerType: 'PNNR', percentage: 16,   appliesSustraendo: false, progressiveTariff: false },
    { code: '047', description: 'Premios Loterías/Hipódromos (PJD)',                   taxpayerType: 'PJD',  percentage: 16,   appliesSustraendo: false, progressiveTariff: false },
    { code: '048', description: 'Premios Loterías/Hipódromos (PJND)',                  taxpayerType: 'PJND', percentage: 16,   appliesSustraendo: false, progressiveTariff: false },

    // Premios a propietarios de animales de carrera (art. 9 num.10)
    { code: '049', description: 'Premios a propietarios animales de carrera (PNR)',    taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '050', description: 'Premios a propietarios animales de carrera (PNNR)',   taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '051', description: 'Premios a propietarios animales de carrera (PJD)',    taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '052', description: 'Premios a propietarios animales de carrera (PJND)',   taxpayerType: 'PJND', percentage: 5,    appliesSustraendo: false, progressiveTariff: false },

    // Contratistas/subcontratistas (art. 9 num.11)
    { code: '053', description: 'Contratistas/Subcontratistas obras y servicios (PNR)',  taxpayerType: 'PNR',  percentage: 1,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '054', description: 'Contratistas/Subcontratistas obras y servicios (PNNR)', taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '055', description: 'Contratistas/Subcontratistas obras y servicios (PJD)',  taxpayerType: 'PJD',  percentage: 2,    appliesSustraendo: false, progressiveTariff: false },
    { code: '056', description: 'Contratistas/Subcontratistas obras y servicios (PJND)', taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Administradores de inmuebles → arrendadores (art. 9 num.12)
    { code: '057', description: 'Administradores de inmuebles → arrendadores (PNR)',   taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '058', description: 'Administradores de inmuebles → arrendadores (PNNR)',  taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '059', description: 'Administradores de inmuebles → arrendadores (PJD)',   taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '060', description: 'Administradores de inmuebles → arrendadores (PJND)',  taxpayerType: 'PJND', percentage: 0,    appliesSustraendo: false, progressiveTariff: true },

    // Cánones arrendamiento bienes muebles (art. 9 num.13)
    { code: '061', description: 'Cánones arrendamiento bienes muebles (PNR)',          taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '062', description: 'Cánones arrendamiento bienes muebles (PNNR)',         taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '063', description: 'Cánones arrendamiento bienes muebles (PJD)',          taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '064', description: 'Cánones arrendamiento bienes muebles (PJND)',         taxpayerType: 'PJND', percentage: 5,    appliesSustraendo: false, progressiveTariff: false },

    // Tarjetas de crédito (art. 9 num.14)
    { code: '065', description: 'Tarjetas de Crédito por venta de bienes/servicios (PNR)',  taxpayerType: 'PNR',  percentage: 3,  appliesSustraendo: false, progressiveTariff: false, notes: 'Sin mínimo (Art.9 §2 num.14)' },
    { code: '066', description: 'Tarjetas de Crédito por venta de bienes/servicios (PNNR)', taxpayerType: 'PNNR', percentage: 34, appliesSustraendo: false, progressiveTariff: false },
    { code: '067', description: 'Tarjetas de Crédito por venta de bienes/servicios (PJD)',  taxpayerType: 'PJD',  percentage: 5,  appliesSustraendo: false, progressiveTariff: false, notes: 'Sin mínimo (Art.9 §2 num.14)' },
    { code: '068', description: 'Tarjetas de Crédito por venta de bienes/servicios (PJND)', taxpayerType: 'PJND', percentage: 5,  appliesSustraendo: false, progressiveTariff: false },
    { code: '069', description: 'Tarjetas de Crédito venta gasolina (PNR)',           taxpayerType: 'PNR',  percentage: 1,  appliesSustraendo: false, progressiveTariff: false },
    { code: '070', description: 'Tarjetas de Crédito venta gasolina (PJD)',           taxpayerType: 'PJD',  percentage: 1,  appliesSustraendo: false, progressiveTariff: false },

    // Fletes terrestres (art. 9 num.15)
    { code: '071', description: 'Fletes terrestres pagados a personas en el país (PNR)', taxpayerType: 'PNR',  percentage: 1, appliesSustraendo: true,  progressiveTariff: false },
    { code: '072', description: 'Fletes terrestres pagados a personas en el país (PJD)', taxpayerType: 'PJD',  percentage: 3, appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 750 },

    // Empresas de seguro (art. 9 num.16)
    { code: '073', description: 'Empresas de Seguro/Corretaje/Reaseguro por servicios propios (PNR)',  taxpayerType: 'PNR',  percentage: 3, appliesSustraendo: true,  progressiveTariff: false },
    { code: '074', description: 'Empresas de Seguro/Corretaje/Reaseguro por servicios propios (PJD)',  taxpayerType: 'PJD',  percentage: 5, appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '075', description: 'Empresas Seguros → Contratistas reparación daños (PNR)',              taxpayerType: 'PNR',  percentage: 3, appliesSustraendo: true,  progressiveTariff: false },
    { code: '076', description: 'Empresas Seguros → Contratistas reparación daños (PJD)',              taxpayerType: 'PJD',  percentage: 5, appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '077', description: 'Empresas Seguros → Clínicas/Hospitales atención asegurados (PNR)',    taxpayerType: 'PNR',  percentage: 3, appliesSustraendo: true,  progressiveTariff: false },
    { code: '078', description: 'Empresas Seguros → Clínicas/Hospitales atención asegurados (PJD)',    taxpayerType: 'PJD',  percentage: 5, appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },

    // Adquisición de fondos de comercio (art. 9 num.18)
    { code: '079', description: 'Adquisición de Fondos de Comercio (PNR)',             taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '080', description: 'Adquisición de Fondos de Comercio (PNNR)',            taxpayerType: 'PNNR', percentage: 34,   appliesSustraendo: false, progressiveTariff: false },
    { code: '081', description: 'Adquisición de Fondos de Comercio (PJD)',             taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '082', description: 'Adquisición de Fondos de Comercio (PJND)',            taxpayerType: 'PJND', percentage: 5,    appliesSustraendo: false, progressiveTariff: false },

    // Publicidad y propaganda (art. 9 num.19)
    { code: '083', description: 'Publicidad y Propaganda (PNR)',                       taxpayerType: 'PNR',  percentage: 3,    appliesSustraendo: true,  progressiveTariff: false },
    { code: '084', description: 'Publicidad y Propaganda (PJD)',                       taxpayerType: 'PJD',  percentage: 5,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 1250 },
    { code: '085', description: 'Publicidad y Propaganda (PJND)',                      taxpayerType: 'PJND', percentage: 5,    appliesSustraendo: false, progressiveTariff: false },
    { code: '086', description: 'Publicidad/Propaganda a emisoras de radio (PJD)',     taxpayerType: 'PJD',  percentage: 3,    appliesSustraendo: false, progressiveTariff: false, minThresholdBs: 750 },
];

// ── Helpers de búsqueda ──────────────────────────────────────────────────────

const BY_CODE: ReadonlyMap<string, IslrConcept> = new Map(
    ISLR_CONCEPTS.map((c) => [c.code, c]),
);

export function getIslrConcept(code: string): IslrConcept | undefined {
    return BY_CODE.get(code);
}

/** Conceptos válidos para usar en facturas de compra (excluye 001 sueldos). */
export function listIslrConceptsForPurchases(): IslrConcept[] {
    return ISLR_CONCEPTS.filter((c) => c.code !== '001');
}

// ── Cálculo de la retención ──────────────────────────────────────────────────

export interface IslrComputeInput {
    /** Base sobre la que se calcula la retención (en Bs). */
    base:             number;
    /** Concepto seleccionado. */
    concept:          IslrConcept;
    /** Valor actual de la Unidad Tributaria en Bs. Requerido para PNR. */
    unidadTributaria: number;
}

export interface IslrComputeResult {
    /** Alícuota efectiva aplicada (%). */
    porcentaje:    number;
    /** Sustraendo en Bs (0 si el concepto no aplica fórmula PNR). */
    sustraendo:    number;
    /** Monto a retener en Bs. Cero si no supera mínimos o sustraendo. */
    monto:         number;
    /** Razón cuando monto = 0 a pesar de tener base > 0. */
    skippedReason?: 'below-min-pjd' | 'sustraendo-mayor-base' | 'tariff-not-supported';
}

const SUSTRAENDO_FACTOR = 83.3334;

/**
 * Calcula la retención ISLR según las reglas del Decreto 1808.
 *
 * Casos:
 *   - PNR con sustraendo: monto = (base × %) − (UT × % × 83.3334).
 *     Si el resultado < 0 ⇒ no se retiene.
 *   - PJD con mínimo: si monto < minThresholdBs ⇒ no se retiene.
 *   - PJND con tramos progresivos: NO calculado en v1 — devuelve 0 con
 *     skippedReason='tariff-not-supported' (el contador debe configurarlo
 *     manualmente).
 *   - Resto (PNNR, casos sin restricciones): monto = base × %.
 */
export function computeIslrRetention(input: IslrComputeInput): IslrComputeResult {
    const { base, concept, unidadTributaria } = input;

    if (!Number.isFinite(base) || base <= 0) {
        return { porcentaje: concept.percentage, sustraendo: 0, monto: 0 };
    }

    // Tramos progresivos PJND — diferidos en v1.
    if (concept.progressiveTariff) {
        return { porcentaje: 0, sustraendo: 0, monto: 0, skippedReason: 'tariff-not-supported' };
    }

    const pct = concept.percentage;
    if (pct <= 0) {
        return { porcentaje: 0, sustraendo: 0, monto: 0 };
    }

    // Sustraendo (PNR).
    let sustraendo = 0;
    if (concept.appliesSustraendo) {
        if (!Number.isFinite(unidadTributaria) || unidadTributaria <= 0) {
            // Sin UT no podemos calcular. Devuelve 0 con razón implícita.
            return { porcentaje: pct, sustraendo: 0, monto: 0 };
        }
        sustraendo = round2(unidadTributaria * (pct / 100) * SUSTRAENDO_FACTOR);
    }

    const grossWithholding = round2((base * pct) / 100);
    const netWithholding   = round2(grossWithholding - sustraendo);

    if (concept.appliesSustraendo && netWithholding <= 0) {
        return { porcentaje: pct, sustraendo, monto: 0, skippedReason: 'sustraendo-mayor-base' };
    }

    const monto = Math.max(0, netWithholding);

    // Mínimo PJD (1.250 / 750).
    if (concept.minThresholdBs != null && monto < concept.minThresholdBs) {
        return { porcentaje: pct, sustraendo, monto: 0, skippedReason: 'below-min-pjd' };
    }

    return { porcentaje: pct, sustraendo, monto };
}

// ── Etiquetas / formateo ─────────────────────────────────────────────────────

export const TAXPAYER_TYPE_LABELS: Record<IslrTaxpayerType, string> = {
    PNR:  'Persona Natural Residente',
    PNNR: 'Persona Natural No Residente',
    PJD:  'Persona Jurídica Domiciliada',
    PJND: 'Persona Jurídica No Domiciliada',
};

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
