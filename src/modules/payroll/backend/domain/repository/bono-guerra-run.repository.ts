import { Result }            from "@/src/core/domain/result";
import { BonoGuerraRun }     from "../bono-guerra-run";
import { BonoGuerraReceipt } from "../bono-guerra-receipt";

export type BonoGuerraRunStatus = "draft" | "confirmed";

export interface SaveBonoGuerraRunInput {
    run: {
        companyId:    string;
        periodStart:  string;
        periodEnd:    string;
        montoUsd:     number;
        exchangeRate: number;
        status?:      BonoGuerraRunStatus;  // defaults to "confirmed" when omitted
    };
    receipts: Omit<BonoGuerraReceipt, "id" | "runId" | "createdAt">[];
}

/** Run identity returned after reverting a confirmed run back to draft. */
export interface UnconfirmedRun {
    id:        string;
    companyId: string;
}

export interface IBonoGuerraRunRepository {
    save(input: SaveBonoGuerraRunInput): Promise<Result<string>>;
    findByCompany(companyId: string): Promise<Result<BonoGuerraRun[]>>;
    findReceiptsByRun(runId: string): Promise<Result<BonoGuerraReceipt[]>>;
    /** Reverts a confirmed run to draft so it can be edited and re-confirmed. */
    unconfirm(runId: string): Promise<Result<UnconfirmedRun>>;
}
