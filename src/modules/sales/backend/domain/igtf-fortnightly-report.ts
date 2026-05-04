// Domain value object: IgtfFortnightlyReport — agregado quincenal de IGTF
// percibido por el SPE (sales) listo para llenar la Forma 99021 en el
// portal SENIAT.
import type { IgtfConcept } from './sales-invoice';

export interface IgtfFortnightlyConceptStat {
    operationCount: number;
    baseAmountBs:   number;
    igtfAmountBs:   number;
}

export interface IgtfFortnightlyReport {
    agentRif:    string;
    period:      string;       // YYYY-MM
    quincena:    1 | 2;
    dateStart:   string;       // YYYY-MM-DD
    dateEnd:     string;
    /** Map of concepto → stats (sólo conceptos con operaciones). */
    byConcept:   Partial<Record<IgtfConcept, IgtfFortnightlyConceptStat>>;
    totalIgtfBs: number;
}

export interface IIgtfFortnightlyRepository {
    getQuincenaReport(input: {
        companyId: string;
        year:      number;
        month:     number;
        quincena:  1 | 2;
    }): Promise<import('@/src/core/domain/result').Result<IgtfFortnightlyReport>>;
}
