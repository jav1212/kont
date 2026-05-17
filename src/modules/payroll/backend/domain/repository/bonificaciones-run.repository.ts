import { Result }                  from "@/src/core/domain/result";
import { BonificacionesRun }       from "../bonificaciones-run";
import { BonificacionesReceipt, BonificacionesBonusLineSnapshot } from "../bonificaciones-receipt";

export type BonificacionesRunStatus = "draft" | "confirmed";

export interface BonificacionesReceiptInput {
    companyId:      string;
    employeeId:     string;   // cedula
    employeeCedula: string;
    employeeNombre: string;
    employeeCargo:  string;
    totalVes:       number;
    bonusLines:     BonificacionesBonusLineSnapshot[];
}

export interface SaveBonificacionesRunInput {
    run: {
        companyId:     string;
        periodStart:   string;
        periodEnd:     string;
        exchangeRate:  number;
        totalVes:      number;
        employeeCount: number;
        lineCount:     number;
        status?:       BonificacionesRunStatus;
    };
    receipts: BonificacionesReceiptInput[];
}

export interface IBonificacionesRunRepository {
    save(input: SaveBonificacionesRunInput): Promise<Result<string>>;
    findByCompany(companyId: string): Promise<Result<BonificacionesRun[]>>;
    findReceiptsByRun(runId: string): Promise<Result<BonificacionesReceipt[]>>;
}
