// Application layer — generates accounting entries when a payroll run is confirmed.
// Non-blocking by design: errors are logged and Result.success is returned so
// the payroll operation is never rolled back by an accounting failure.
// Invariant: only operates on active rules; skips silently if none are configured.
import { Result }                    from '@/src/core/domain/result';
import { IIntegrationRuleRepository } from '../../domain/repository/integration-rule.repository';
import { IIntegrationLogRepository }  from '../../domain/repository/integration-log.repository';
import { IPeriodRepository }          from '../../domain/repository/period.repository';
import { IJournalEntryRepository }    from '../../domain/repository/journal-entry.repository';
import type { AmountField }           from '../../domain/integration-rule';

export interface ProcessPayrollInput {
    companyId:       string;
    payrollRunId:    string;
    periodEnd:       string;   // ISO date — used to locate the open accounting period
    totalEarnings:   number;
    totalDeductions: number;
    netPay:          number;
}

export class ProcessPayrollIntegrationUseCase {
    constructor(
        private readonly ruleRepo:  IIntegrationRuleRepository,
        private readonly logRepo:   IIntegrationLogRepository,
        private readonly periodRepo: IPeriodRepository,
        private readonly entryRepo: IJournalEntryRepository,
    ) {}

    async execute(input: ProcessPayrollInput): Promise<Result<void>> {
        // 1. Get active payroll rules for this company
        const rulesResult = await this.ruleRepo.findByCompany(input.companyId, 'payroll');
        if (rulesResult.isFailure) {
            await this.log(input, null, 'error', rulesResult.getError());
            return Result.success(undefined);
        }
        const rules = rulesResult.getValue().filter((r) => r.isActive);
        if (rules.length === 0) {
            await this.log(input, null, 'skipped', 'No hay reglas de integración configuradas para Nómina');
            return Result.success(undefined);
        }

        // 2. Find the open accounting period containing periodEnd
        const periodResult = await this.periodRepo.findOpenForDate(input.companyId, input.periodEnd);
        if (periodResult.isFailure) {
            await this.log(input, null, 'error', periodResult.getError());
            return Result.success(undefined);
        }
        const period = periodResult.getValue();
        if (!period) {
            await this.log(input, null, 'error', `No hay período contable abierto para la fecha ${input.periodEnd}`);
            return Result.success(undefined);
        }

        // 3. Create one journal entry per rule
        for (const rule of rules) {
            const amount = this.resolveAmount(rule.amountField, input);
            if (amount <= 0) continue;

            const description = this.applyTemplate(rule.description, {
                period: `${input.periodEnd.slice(0, 7)}`,
                ref:    input.payrollRunId,
            });

            const saveResult = await this.entryRepo.save({
                entry: {
                    companyId:   input.companyId,
                    periodId:    period.id,
                    date:        input.periodEnd,
                    description,
                    source:      'payroll',
                    sourceRef:   input.payrollRunId,
                },
                lines: [
                    { accountId: rule.debitAccountId,  type: 'debit',  amount, description: null },
                    { accountId: rule.creditAccountId, type: 'credit', amount, description: null },
                ],
            });

            if (saveResult.isFailure) {
                await this.log(input, null, 'error', saveResult.getError());
                continue;
            }

            const entryId = saveResult.getValue();
            const postResult = await this.entryRepo.post(entryId);

            if (postResult.isFailure) {
                await this.log(input, entryId, 'error', postResult.getError());
                continue;
            }

            await this.log(input, entryId, 'success', null);
        }

        return Result.success(undefined);
    }

    private resolveAmount(field: AmountField, input: ProcessPayrollInput): number {
        switch (field) {
            case 'total_earnings':   return input.totalEarnings;
            case 'total_deductions': return input.totalDeductions;
            case 'net_pay':          return input.netPay;
            default:                 return 0;
        }
    }

    private applyTemplate(template: string, vars: Record<string, string>): string {
        return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    }

    private async log(
        input:   ProcessPayrollInput,
        entryId: string | null,
        status:  string,
        error:   string | null,
    ) {
        await this.logRepo.save({
            companyId:    input.companyId,
            source:       'payroll',
            sourceRef:    input.payrollRunId,
            entryId,
            status,
            errorMessage: error,
        });
    }
}
