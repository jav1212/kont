// ============================================================================
// Seniat Calendar — Domain Types
// ============================================================================

export type TaxpayerType = "ordinario" | "especial";

export type ObligationCategory =
    | "IVA"
    | "ISLR_RETENCIONES"
    | "ISLR_ANUAL"
    | "ISLR_ESTIMADA"
    | "IGTF"
    | "LOCTI"
    | "RETENCIONES_ISLR_TERCEROS"
    | "OTROS";

export type Periodicity = "quincenal" | "mensual" | "anual" | "unica";

export interface ObligationDefinition {
    id: string;
    category: ObligationCategory;
    title: string;
    shortTitle: string;
    description: string;
    legalBasis: string;
    appliesTo: TaxpayerType[];
    periodicity: Periodicity;
    colorToken: string;
}

export interface CalendarEntry {
    obligationId: string;
    category: ObligationCategory;
    title: string;
    shortTitle: string;
    dueDate: string;       // ISO YYYY-MM-DD post-roll (local date)
    originalDate: string;  // ISO YYYY-MM-DD pre-roll
    rolled: boolean;
    period: string;        // "03-2026", "1ra-quincena-03-2026", "2026"
    colorToken: string;
    legalBasis: string;
}

export interface CalendarYear {
    year: number;
    publicationRef: string;
    publicationDate: string;
    obligations: ObligationDefinition[];
    // especialSchedule[obligationId][month 1-12].byLastDigit["0"-"9"] = day[]
    especialSchedule: Record<string, Record<number, { byLastDigit: Record<string, number[]> }>>;
    // ordinarioSchedule[obligationId][month 1-12] = day[] (flat, no digit dependency)
    ordinarioSchedule: Record<string, Record<number, number[]>>;
    holidays: string[];
}
