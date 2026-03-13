import { SupabaseSource }                from "@/src/shared/backend/source/infra/supabase";
import { SupabasePayrollRunRepository }  from "./repository/supabase-payroll-run.repository";
import { ConfirmPayrollRunUseCase }      from "../app/confirm-payroll-run.case";
import { GetPayrollRunsUseCase }         from "../app/get-payroll-runs.case";
import { GetPayrollReceiptsUseCase }     from "../app/get-payroll-receipts.case";

export function getPayrollRunActions() {
    const source     = new SupabaseSource();
    const repository = new SupabasePayrollRunRepository(source);

    return {
        confirm:     new ConfirmPayrollRunUseCase(repository),
        getRuns:     new GetPayrollRunsUseCase(repository),
        getReceipts: new GetPayrollReceiptsUseCase(repository),
    };
}
