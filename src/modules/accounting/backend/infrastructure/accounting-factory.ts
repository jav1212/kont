// Infrastructure layer — assembles the full accounting dependency graph.
// All use cases are wired with their RPC repositories and shared source adapters.
import { ServerSupabaseSource }                              from '@/src/shared/backend/source/infra/server-supabase';
import { RpcAccountRepository }                              from './repository/rpc-account.repository';
import { RpcChartRepository }                                from './repository/rpc-chart.repository';
import { RpcPeriodRepository }                               from './repository/rpc-period.repository';
import { RpcJournalEntryRepository }                         from './repository/rpc-journal-entry.repository';
import { RpcIntegrationRuleRepository }                      from './repository/rpc-integration-rule.repository';
import { RpcIntegrationLogRepository }                       from './repository/rpc-integration-log.repository';
import { SaveAccountUseCase }                                from '../application/commands/save-account.use-case';
import { DeleteAccountUseCase }                              from '../application/commands/delete-account.use-case';
import { SaveChartUseCase }                                  from '../application/commands/save-chart.use-case';
import { DeleteChartUseCase }                                from '../application/commands/delete-chart.use-case';
import { ImportChartUseCase }                                from '../application/commands/import-chart.use-case';
import { SaveJournalEntryUseCase }                           from '../application/commands/save-journal-entry.use-case';
import { PostJournalEntryUseCase }                           from '../application/commands/post-journal-entry.use-case';
import { SaveAccountingPeriodUseCase }                       from '../application/commands/save-accounting-period.use-case';
import { CloseAccountingPeriodUseCase }                      from '../application/commands/close-accounting-period.use-case';
import { SaveIntegrationRuleUseCase }                        from '../application/commands/save-integration-rule.use-case';
import { DeleteIntegrationRuleUseCase }                      from '../application/commands/delete-integration-rule.use-case';
import { ProcessPayrollIntegrationUseCase }                  from '../application/commands/process-payroll-integration.use-case';
import { ProcessInventoryPurchaseIntegrationUseCase }        from '../application/commands/process-inventory-purchase-integration.use-case';
import { GetAccountsUseCase }                                from '../application/queries/get-accounts.use-case';
import { GetChartsUseCase }                                  from '../application/queries/get-charts.use-case';
import { GetJournalEntriesUseCase }                          from '../application/queries/get-journal-entries.use-case';
import { GetEntryWithLinesUseCase }                          from '../application/queries/get-entry-with-lines.use-case';
import { GetAccountingPeriodsUseCase }                       from '../application/queries/get-accounting-periods.use-case';
import { GetTrialBalanceUseCase }                            from '../application/queries/get-trial-balance.use-case';
import { GetIntegrationRulesUseCase }                        from '../application/queries/get-integration-rules.use-case';
import { GetIntegrationLogUseCase }                          from '../application/queries/get-integration-log.use-case';

export function getAccountingActions(userId: string) {
    const source        = new ServerSupabaseSource();
    const accountRepo   = new RpcAccountRepository(source, userId);
    const chartRepo     = new RpcChartRepository(source, userId);
    const periodRepo    = new RpcPeriodRepository(source, userId);
    const entryRepo     = new RpcJournalEntryRepository(source, userId);
    const ruleRepo      = new RpcIntegrationRuleRepository(source, userId);
    const logRepo       = new RpcIntegrationLogRepository(source, userId);

    return {
        // Accounts
        getAccounts:    new GetAccountsUseCase(accountRepo),
        saveAccount:    new SaveAccountUseCase(accountRepo),
        deleteAccount:  new DeleteAccountUseCase(accountRepo),

        // Charts (plan de cuentas)
        getCharts:    new GetChartsUseCase(chartRepo),
        saveChart:    new SaveChartUseCase(chartRepo),
        deleteChart:  new DeleteChartUseCase(chartRepo),
        importChart:  new ImportChartUseCase(chartRepo),

        // Periods
        getPeriods:     new GetAccountingPeriodsUseCase(periodRepo),
        savePeriod:     new SaveAccountingPeriodUseCase(periodRepo),
        closePeriod:    new CloseAccountingPeriodUseCase(periodRepo),

        // Entries
        getEntries:        new GetJournalEntriesUseCase(entryRepo),
        getEntryWithLines: new GetEntryWithLinesUseCase(entryRepo),
        saveEntry:         new SaveJournalEntryUseCase(entryRepo),
        postEntry:         new PostJournalEntryUseCase(entryRepo),

        // Reports
        getTrialBalance: new GetTrialBalanceUseCase(entryRepo),

        // Integration rules
        getIntegrationRules:   new GetIntegrationRulesUseCase(ruleRepo),
        saveIntegrationRule:   new SaveIntegrationRuleUseCase(ruleRepo),
        deleteIntegrationRule: new DeleteIntegrationRuleUseCase(ruleRepo),

        // Integration log
        getIntegrationLog: new GetIntegrationLogUseCase(logRepo),

        // Integration processors (called from other module route handlers)
        processPayrollIntegration:           new ProcessPayrollIntegrationUseCase(ruleRepo, logRepo, periodRepo, entryRepo),
        processInventoryPurchaseIntegration: new ProcessInventoryPurchaseIntegrationUseCase(ruleRepo, logRepo, periodRepo, entryRepo),
    };
}
