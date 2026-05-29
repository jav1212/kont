import { Result }              from "@/src/core/domain/result";
import { CestaTicketRun }      from "../cesta-ticket-run";
import { CestaTicketReceipt }  from "../cesta-ticket-receipt";

export type CestaTicketRunStatus = "draft" | "confirmed";

export interface SaveCestaTicketRunInput {
    run: {
        companyId:    string;
        periodStart:  string;
        periodEnd:    string;
        montoUsd:     number;
        exchangeRate: number;
        status?:      CestaTicketRunStatus;  // defaults to "confirmed" when omitted
    };
    receipts: Omit<CestaTicketReceipt, "id" | "runId" | "createdAt">[];
}

/** Run identity returned after reverting a confirmed run back to draft. */
export interface UnconfirmedRun {
    id:        string;
    companyId: string;
}

export interface ICestaTicketRunRepository {
    save(input: SaveCestaTicketRunInput): Promise<Result<string>>;
    findByCompany(companyId: string): Promise<Result<CestaTicketRun[]>>;
    findReceiptsByRun(runId: string): Promise<Result<CestaTicketReceipt[]>>;
    /** Reverts a confirmed run to draft so it can be edited and re-confirmed. */
    unconfirm(runId: string): Promise<Result<UnconfirmedRun>>;
}
