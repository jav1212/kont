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

export interface IBonoGuerraRunRepository {
    save(input: SaveBonoGuerraRunInput): Promise<Result<string>>;
    findByCompany(companyId: string): Promise<Result<BonoGuerraRun[]>>;
    findReceiptsByRun(runId: string): Promise<Result<BonoGuerraReceipt[]>>;
}
