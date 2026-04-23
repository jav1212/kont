/**
 * ✅ DATOS OFICIALES — Providencia Administrativa SNAT/2025/000091
 * "Calendario de Sujetos Pasivos Especiales y Agentes de Retención para aquellas
 *  obligaciones que deben cumplirse para el año 2026".
 * Publicada en Gaceta Oficial de la República Bolivariana de Venezuela
 * Nº 43.273 de fecha 09 de diciembre de 2025 (Caracas, 24 de noviembre de 2025).
 *
 * Complementado con:
 *   · Providencia SNAT/2025/000092 — Juegos de Envite o Azar no especiales
 *   · Providencia SNAT/2025/000093 — Contribución Especial Pensiones (Bloqueo Imperialista)
 *
 * Para contribuyentes ordinarios se aplican las reglas generales de la Ley del IVA
 * (Art. 47) y la Ley de ISLR (Art. 146) dado que no existe calendario especial.
 *
 * Última actualización: 2026-04-23
 */

import type { CalendarYear, ObligationCategory, ObligationDefinition, Periodicity, TaxpayerType } from "./types";
import { HOLIDAYS_2026 } from "./holidays-2026";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Expande una tabla por dígito (0-9, cada una con 12 valores mensuales)
 * al shape de especialSchedule: Record<month, { byLastDigit: Record<digit, day[]> }>
 */
function expandPerDigitSchedule(
    table: Record<string, number[]>,
): Record<number, { byLastDigit: Record<string, number[]> }> {
    const result: Record<number, { byLastDigit: Record<string, number[]> }> = {};
    for (let m = 1; m <= 12; m++) {
        result[m] = {
            byLastDigit: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [], "9": [] },
        };
    }
    for (const digit of Object.keys(table)) {
        const days = table[digit];
        for (let i = 0; i < days.length; i++) {
            if (days[i] > 0) result[i + 1].byLastDigit[digit] = [days[i]];
        }
    }
    return result;
}

/**
 * Expande una tabla agrupada por pares de dígitos (0y8 / 1y4 / 2y3 / 5y9 / 6y7)
 * al shape de especialSchedule. Cada par comparte la misma fecha de vencimiento.
 */
function expandPairSchedule(
    table: Partial<Record<"0y8" | "1y4" | "2y3" | "5y9" | "6y7", number[]>>,
): Record<number, { byLastDigit: Record<string, number[]> }> {
    const pairMap: Record<string, string[]> = {
        "0y8": ["0", "8"],
        "1y4": ["1", "4"],
        "2y3": ["2", "3"],
        "5y9": ["5", "9"],
        "6y7": ["6", "7"],
    };
    const result: Record<number, { byLastDigit: Record<string, number[]> }> = {};
    for (let m = 1; m <= 12; m++) {
        result[m] = {
            byLastDigit: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [], "9": [] },
        };
    }
    for (const pair of Object.keys(table) as Array<keyof typeof table>) {
        const digits = pairMap[pair];
        const days = table[pair]!;
        for (let i = 0; i < days.length; i++) {
            const month = i + 1;
            if (days[i] > 0) {
                for (const d of digits) {
                    result[month].byLastDigit[d] = [days[i]];
                }
            }
        }
    }
    return result;
}

// ── Tablas oficiales de la Providencia SNAT/2025/000091 ────────────────────────

// Art. 1 · literal a.1 — Retenciones IVA practicadas entre los días 01 al 15 de cada mes
// (mes de columna = mes de DECLARACIÓN, mismo mes del período retenido)
const IVA_RET_1RA_TABLE: Record<string, number[]> = {
    "0": [28, 20, 25, 23, 20, 29, 27, 31, 29, 20, 27, 16],
    "1": [ 6, 23, 20, 27, 18, 26, 21, 25, 18, 28, 26, 29],
    "2": [21, 18, 24, 21, 29, 16, 30, 24, 24, 29, 17, 21],
    "3": [30, 18, 23, 30, 22, 18, 23, 18, 21, 23, 23, 28],
    "4": [23, 25, 26, 20, 21, 19, 28, 19, 30, 22, 20, 22],
    "5": [22, 27, 30, 22, 28, 17, 22, 21, 25, 30, 18, 17],
    "6": [20, 19, 27, 24, 19, 30, 20, 28, 28, 21, 25, 18],
    "7": [27, 24, 18, 17, 26, 22, 31, 20, 22, 27, 19, 18],
    "8": [26, 26, 31, 29, 27, 23, 17, 26, 17, 26, 24, 30],
    "9": [29, 27, 17, 28, 25, 25, 29, 27, 23, 19, 30, 23],
};

// Art. 1 · literal a.2 — Retenciones IVA practicadas entre los días 16 y el último de cada mes
// (mes de columna = mes de DECLARACIÓN; el período retenido es el mes ANTERIOR)
const IVA_RET_2DA_TABLE: Record<string, number[]> = {
    "0": [15,  9,  6,  1,  6, 12,  8, 14, 14,  5, 13,  3],
    "1": [ 6, 10,  3, 14,  4, 11,  3, 13,  3, 14, 12, 15],
    "2": [ 8,  5,  9,  8, 14,  3, 14, 12, 10, 15,  2,  4],
    "3": [16, 12,  4, 16,  7, 10,  7,  5,  2,  7,  9, 11],
    "4": [ 9,  2, 11,  7, 13,  2, 10,  6,  9,  6,  5,  7],
    "5": [ 5, 13, 12,  9, 15,  8,  6,  3, 15,  8,  4, 10],
    "6": [13,  4, 10, 13,  5, 15,  9,  4, 11,  2, 11,  8],
    "7": [12, 11,  2,  6, 11,  4, 15, 10,  4, 13,  3,  2],
    "8": [ 7,  3, 13, 10, 12,  5,  2,  7,  8,  9,  6,  9],
    "9": [14,  6,  5, 15,  8,  9, 13, 11,  7,  1, 10, 14],
};

// Art. 1 · literal b — Estimadas ISLR (Porciones Ejercicios Regulares e Irregulares)
// NOTA: esta misma tabla aplica también a:
//   · IVA Mensual de Sujetos Pasivos Especiales (Art. 2)
//   · Aporte del 70% Servicios Desconcentrados (Art. 1 · literal i)
const ISLR_ESTIMADA_TABLE: Partial<Record<"0y8" | "1y4" | "2y3" | "5y9" | "6y7", number[]>> = {
    "0y8": [15,  9, 13, 10, 12, 12,  8, 14,  8,  9, 13,  9],
    "1y4": [ 9, 10, 11, 14, 13, 11, 10, 13,  9, 14, 12, 15],
    "2y3": [ 8, 12,  9,  8, 14, 10, 14, 12, 10, 15,  9, 11],
    "5y9": [14, 13, 12,  9, 15,  9, 13, 11, 15,  8, 10, 10],
    "6y7": [13, 11, 10, 13, 11, 15,  9, 10, 11, 13, 11,  8],
};

// Art. 1 · literal c — Retenciones ISLR practicadas durante el mes
const ISLR_RETENCIONES_TABLE: Partial<Record<"0y8" | "1y4" | "2y3" | "5y9" | "6y7", number[]>> = {
    "0y8": [15,  9,  6, 10, 12,  5,  8,  7,  8,  9,  6,  9],
    "1y4": [ 9, 10, 11,  7, 13, 11, 10,  6,  9,  6,  5,  7],
    "2y3": [ 8,  5,  9,  8,  7, 10,  7, 12, 10,  7,  9, 11],
    "5y9": [14,  6,  5,  9,  8,  9,  6, 11,  7,  8, 10, 10],
    "6y7": [13, 11, 10,  6, 11,  4,  9, 10,  4, 13, 11,  8],
};

// Art. 1 · literal h — Grandes Patrimonios (Oct + Nov únicamente)
const GRANDES_PATRIMONIOS_TABLE: Partial<Record<"0y8" | "1y4" | "2y3" | "5y9" | "6y7", { oct: number; nov: number }>> = {
    "0y8": { oct:  9, nov: 13 },
    "1y4": { oct: 14, nov: 12 },
    "2y3": { oct: 15, nov:  9 },
    "5y9": { oct:  8, nov: 10 },
    "6y7": { oct: 13, nov: 11 },
};

// Providencia SNAT/2025/000093 — Contribución Especial Pensiones (nueva 2026)
const CONTRIBUCION_PENSIONES_TABLE: Record<string, number[]> = {
    "0": [28, 20, 25, 23, 20, 29, 27, 17, 29, 20, 27, 16],
    "1": [19, 23, 20, 27, 18, 26, 21, 25, 18, 28, 26, 29],
    "2": [21, 18, 24, 21, 29, 16, 30, 24, 24, 29, 17, 21],
    "3": [30, 12, 23, 30, 22, 18, 23, 18, 21, 23, 23, 28],
    "4": [23, 25, 26, 20, 21, 19, 28, 19, 16, 22, 20, 22],
    "5": [22, 27, 30, 22, 28, 17, 22, 16, 20, 30, 18, 17],
    "6": [20, 19, 27, 24, 19, 30, 20, 28, 28, 21, 15, 18],
    "7": [27, 24, 18, 17, 26, 22, 16, 20, 22, 27, 19, 18],
    "8": [26, 26, 16, 29, 27, 23, 17, 26, 17, 26, 24, 30],
    "9": [29, 27, 17, 28, 25, 25, 29, 27, 23, 16, 30, 23],
};

// Art. 1 · literal f — Autoliquidación Anual ISLR (ejercicio fiscal 2025 → pago 2026)
const ISLR_ANUAL_DATES = [
    { pair: "2y3", month: 1, day: 30 },  // 30/01/2026
    { pair: "5y9", month: 2, day: 27 },  // 27/02/2026
    { pair: "0y8", month: 3, day:  6 },  // 06/03/2026
    { pair: "1y4", month: 3, day: 11 },  // 11/03/2026
    { pair: "6y7", month: 3, day: 16 },  // 16/03/2026
] as const;

// ── Definiciones de obligaciones ──────────────────────────────────────────────

const OBLIGATIONS_2026 = {
    // ── SUJETOS PASIVOS ESPECIALES ────────────────────────────────────────────

    IVA_RETENCIONES_1RA: {
        id: "iva-retenciones-1ra",
        category: "IVA" as ObligationCategory,
        title: "Retenciones IVA — 1ª Quincena",
        shortTitle: "Ret. IVA 1Q",
        description:
            "Declaración y enteramiento de las retenciones del Impuesto al Valor Agregado practicadas entre los días 1 y 15 de cada mes. Aplica a sujetos pasivos especiales en su calidad de agentes de retención. La fecha de vencimiento depende del último dígito del RIF.",
        legalBasis: "Providencia SNAT/2025/000091 · Art. 1, literal a.1",
        appliesTo: ["especial"] as TaxpayerType[],
        periodicity: "quincenal" as Periodicity,
        colorToken: "info",
    },
    IVA_RETENCIONES_2DA: {
        id: "iva-retenciones-2da",
        category: "IVA" as ObligationCategory,
        title: "Retenciones IVA — 2ª Quincena",
        shortTitle: "Ret. IVA 2Q",
        description:
            "Declaración y enteramiento de las retenciones del Impuesto al Valor Agregado practicadas entre los días 16 y el último de cada mes. Aplica a sujetos pasivos especiales en su calidad de agentes de retención. La fecha de vencimiento depende del último dígito del RIF.",
        legalBasis: "Providencia SNAT/2025/000091 · Art. 1, literal a.2",
        appliesTo: ["especial"] as TaxpayerType[],
        periodicity: "quincenal" as Periodicity,
        colorToken: "info",
    },
    IVA_MENSUAL_ESPECIAL: {
        id: "iva-mensual-especial",
        category: "IVA" as ObligationCategory,
        title: "Declaración IVA Mensual",
        shortTitle: "IVA Mensual",
        description:
            "Declaración y pago del Impuesto al Valor Agregado mensual para sujetos pasivos especiales. La fecha se asigna según el último dígito del RIF agrupado en pares (0-8, 1-4, 2-3, 5-9, 6-7). Los contribuyentes con actividades exclusivamente exentas o exoneradas presentan declaración informativa trimestral.",
        legalBasis: "Providencia SNAT/2025/000091 · Art. 2 y 3 · Ley del IVA",
        appliesTo: ["especial"] as TaxpayerType[],
        periodicity: "mensual" as Periodicity,
        colorToken: "info",
    },
    ISLR_ESTIMADA: {
        id: "islr-estimada",
        category: "ISLR_ESTIMADA" as ObligationCategory,
        title: "Declaración Estimada ISLR — Porciones",
        shortTitle: "ISLR Estimada",
        description:
            "Declaración y pago de las porciones de la Declaración Estimada de Impuesto sobre la Renta para ejercicios regulares e irregulares. La fecha se asigna según el último dígito del RIF agrupado en pares.",
        legalBasis: "Providencia SNAT/2025/000091 · Art. 1, literal b",
        appliesTo: ["especial"] as TaxpayerType[],
        periodicity: "mensual" as Periodicity,
        colorToken: "warning",
    },
    ISLR_RETENCIONES: {
        id: "islr-retenciones",
        category: "ISLR_RETENCIONES" as ObligationCategory,
        title: "Retenciones ISLR a Terceros",
        shortTitle: "Ret. ISLR",
        description:
            "Enteramiento mensual de las retenciones del Impuesto sobre la Renta practicadas a terceros por sujetos pasivos especiales en su calidad de agentes de retención. La fecha se asigna según el último dígito del RIF agrupado en pares.",
        legalBasis: "Providencia SNAT/2025/000091 · Art. 1, literal c · Providencia SNAT/2005/0056",
        appliesTo: ["especial"] as TaxpayerType[],
        periodicity: "mensual" as Periodicity,
        colorToken: "warning",
    },
    ISLR_ANUAL_ESPECIAL: {
        id: "islr-anual-especial",
        category: "ISLR_ANUAL" as ObligationCategory,
        title: "Autoliquidación Anual ISLR — Ejercicio 2025",
        shortTitle: "ISLR Anual",
        description:
            "Declaración definitiva y pago del Impuesto sobre la Renta correspondiente al ejercicio fiscal del 01/01/2025 al 31/12/2025. La fecha de vencimiento depende del último dígito del RIF agrupado en pares (2-3 en enero; 5-9 en febrero; 0-8, 1-4 y 6-7 en marzo).",
        legalBasis: "Providencia SNAT/2025/000091 · Art. 1, literal f",
        appliesTo: ["especial"] as TaxpayerType[],
        periodicity: "anual" as Periodicity,
        colorToken: "error",
    },
    GRANDES_PATRIMONIOS: {
        id: "grandes-patrimonios",
        category: "OTROS" as ObligationCategory,
        title: "Impuesto a los Grandes Patrimonios",
        shortTitle: "Gran. Patrim.",
        description:
            "Declaración y pago del Impuesto a los Grandes Patrimonios. Aplica a personas con patrimonio neto superior al umbral establecido. Se presenta en octubre y noviembre según último dígito del RIF agrupado en pares.",
        legalBasis: "Providencia SNAT/2025/000091 · Art. 1, literal h · Ley de Impuesto a los Grandes Patrimonios",
        appliesTo: ["especial"] as TaxpayerType[],
        periodicity: "mensual" as Periodicity,
        colorToken: "neutral",
    },
    CONTRIBUCION_PENSIONES: {
        id: "contribucion-pensiones",
        category: "OTROS" as ObligationCategory,
        title: "Contribución Especial Pensiones — Bloqueo Imperialista",
        shortTitle: "Aporte Pensiones",
        description:
            "Declaración y pago de la contribución especial para la protección de las pensiones de la seguridad social frente al bloqueo imperialista. Aplica a personas jurídicas y sociedades de personas con actividad económica en el territorio nacional. La fecha se asigna según el último dígito del RIF.",
        legalBasis: "Providencia SNAT/2025/000093 · Ley de Protección de las Pensiones (Gaceta Oficial Nº 6.806 Extraordinario)",
        appliesTo: ["especial"] as TaxpayerType[],
        periodicity: "mensual" as Periodicity,
        colorToken: "neutral",
    },
    LOCTI: {
        id: "locti",
        category: "LOCTI" as ObligationCategory,
        title: "Aporte LOCTI (FONACIT)",
        shortTitle: "LOCTI",
        description:
            "Aporte anual al Fondo Nacional de Ciencia, Tecnología e Innovación. Aplica a empresas con ingresos brutos superiores al umbral legal durante el ejercicio fiscal anterior. Vencimiento dentro del segundo trimestre del año.",
        legalBasis: "Ley Orgánica de Ciencia, Tecnología e Innovación (LOCTI) · Art. 26",
        appliesTo: ["ordinario", "especial"] as TaxpayerType[],
        periodicity: "anual" as Periodicity,
        colorToken: "success",
    },

    // ── CONTRIBUYENTES ORDINARIOS ─────────────────────────────────────────────

    IVA_ORDINARIO: {
        id: "iva-ordinario",
        category: "IVA" as ObligationCategory,
        title: "Declaración IVA Mensual — Ordinario",
        shortTitle: "IVA",
        description:
            "Declaración y pago del Impuesto al Valor Agregado para contribuyentes ordinarios no calificados como sujetos pasivos especiales. Vence dentro de los 15 días continuos siguientes al cierre del período de imposición.",
        legalBasis: "Ley del IVA · Art. 47 · Reglamento del IVA · Art. 60",
        appliesTo: ["ordinario"] as TaxpayerType[],
        periodicity: "mensual" as Periodicity,
        colorToken: "info",
    },
    ISLR_ANUAL_ORDINARIO: {
        id: "islr-anual-ordinario",
        category: "ISLR_ANUAL" as ObligationCategory,
        title: "Declaración Anual ISLR — Ordinario",
        shortTitle: "ISLR Anual",
        description:
            "Declaración definitiva de rentas del Impuesto sobre la Renta para personas jurídicas con cierre al 31 de diciembre. Debe presentarse dentro de los tres meses siguientes al cierre del ejercicio fiscal.",
        legalBasis: "Ley de ISLR · Art. 146 · Reglamento · Art. 172",
        appliesTo: ["ordinario"] as TaxpayerType[],
        periodicity: "anual" as Periodicity,
        colorToken: "error",
    },
} satisfies Record<string, ObligationDefinition>;

// ── Construcción de schedules no-genéricos ────────────────────────────────────

function buildIslrAnualSchedule(): Record<number, { byLastDigit: Record<string, number[]> }> {
    const pairMap: Record<string, string[]> = {
        "0y8": ["0", "8"],
        "1y4": ["1", "4"],
        "2y3": ["2", "3"],
        "5y9": ["5", "9"],
        "6y7": ["6", "7"],
    };
    const empty = { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [], "9": [] } as Record<string, number[]>;
    const result: Record<number, { byLastDigit: Record<string, number[]> }> = {};

    for (const entry of ISLR_ANUAL_DATES) {
        const digits = pairMap[entry.pair];
        if (!result[entry.month]) {
            result[entry.month] = { byLastDigit: { ...empty } };
            // reset arrays — cada mes tiene su propio array por dígito
            for (const k of Object.keys(result[entry.month].byLastDigit)) {
                result[entry.month].byLastDigit[k] = [];
            }
        }
        for (const d of digits) {
            result[entry.month].byLastDigit[d] = [entry.day];
        }
    }
    return result;
}

function buildGrandesPatrimoniosSchedule(): Record<number, { byLastDigit: Record<string, number[]> }> {
    const pairMap: Record<string, string[]> = {
        "0y8": ["0", "8"],
        "1y4": ["1", "4"],
        "2y3": ["2", "3"],
        "5y9": ["5", "9"],
        "6y7": ["6", "7"],
    };
    const makeEmpty = () => ({
        "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "7": [], "8": [], "9": [],
    } as Record<string, number[]>);

    const result: Record<number, { byLastDigit: Record<string, number[]> }> = {
        10: { byLastDigit: makeEmpty() },
        11: { byLastDigit: makeEmpty() },
    };
    for (const pair of Object.keys(GRANDES_PATRIMONIOS_TABLE) as Array<keyof typeof GRANDES_PATRIMONIOS_TABLE>) {
        const digits = pairMap[pair];
        const days = GRANDES_PATRIMONIOS_TABLE[pair]!;
        for (const d of digits) {
            result[10].byLastDigit[d] = [days.oct];
            result[11].byLastDigit[d] = [days.nov];
        }
    }
    return result;
}

// ── Export principal ──────────────────────────────────────────────────────────

export const CALENDAR_2026: CalendarYear = {
    year: 2026,
    publicationRef: "Providencia Administrativa SNAT/2025/000091 — Gaceta Oficial Nº 43.273 del 09/12/2025",
    publicationDate: "2025-12-09",

    obligations: Object.values(OBLIGATIONS_2026),

    especialSchedule: {
        [OBLIGATIONS_2026.IVA_RETENCIONES_1RA.id]: expandPerDigitSchedule(IVA_RET_1RA_TABLE),
        [OBLIGATIONS_2026.IVA_RETENCIONES_2DA.id]: expandPerDigitSchedule(IVA_RET_2DA_TABLE),
        [OBLIGATIONS_2026.IVA_MENSUAL_ESPECIAL.id]: expandPairSchedule(ISLR_ESTIMADA_TABLE),
        [OBLIGATIONS_2026.ISLR_ESTIMADA.id]: expandPairSchedule(ISLR_ESTIMADA_TABLE),
        [OBLIGATIONS_2026.ISLR_RETENCIONES.id]: expandPairSchedule(ISLR_RETENCIONES_TABLE),
        [OBLIGATIONS_2026.ISLR_ANUAL_ESPECIAL.id]: buildIslrAnualSchedule(),
        [OBLIGATIONS_2026.GRANDES_PATRIMONIOS.id]: buildGrandesPatrimoniosSchedule(),
        [OBLIGATIONS_2026.CONTRIBUCION_PENSIONES.id]: expandPerDigitSchedule(CONTRIBUCION_PENSIONES_TABLE),
        [OBLIGATIONS_2026.LOCTI.id]: {
            6: {
                byLastDigit: {
                    "0": [30], "1": [30], "2": [30], "3": [30], "4": [30],
                    "5": [30], "6": [30], "7": [30], "8": [30], "9": [30],
                },
            },
        },
    },

    ordinarioSchedule: {
        // IVA Ordinario — día 15 del mes siguiente al período (roll por feriado lo maneja el builder)
        [OBLIGATIONS_2026.IVA_ORDINARIO.id]: {
            1:  [15],  // declara período DIC 2025
            2:  [15],  // declara período ENE 2026
            3:  [15],  // declara período FEB 2026
            4:  [15],  // declara período MAR 2026
            5:  [15],  // declara período ABR 2026
            6:  [15],  // declara período MAY 2026
            7:  [15],  // declara período JUN 2026
            8:  [15],  // declara período JUL 2026
            9:  [15],  // declara período AGO 2026
            10: [15],  // declara período SEP 2026
            11: [15],  // declara período OCT 2026
            12: [15],  // declara período NOV 2026
        },
        [OBLIGATIONS_2026.ISLR_ANUAL_ORDINARIO.id]: {
            3: [31],   // 31 de marzo
        },
        [OBLIGATIONS_2026.LOCTI.id]: {
            6: [30],   // 30 de junio
        },
    },

    holidays: HOLIDAYS_2026,
};
