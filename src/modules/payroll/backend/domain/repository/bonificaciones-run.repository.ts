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

/** Run identity returned after reverting a confirmed run back to draft. */
export interface UnconfirmedRun {
    id:        string;
    companyId: string;
}

export interface IBonificacionesRunRepository {
    save(input: SaveBonificacionesRunInput): Promise<Result<string>>;
    findByCompany(companyId: string): Promise<Result<BonificacionesRun[]>>;
    findReceiptsByRun(runId: string): Promise<Result<BonificacionesReceipt[]>>;
    /** Reverts a confirmed run to draft so it can be edited and re-confirmed. */
    unconfirm(runId: string): Promise<Result<UnconfirmedRun>>;
}
