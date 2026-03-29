// Repository contract for accounting integration rule CRUD.
import { Result }                           from '@/src/core/domain/result';
import { IntegrationRule, IntegrationSource } from '../integration-rule';

export interface SaveIntegrationRuleInput {
    id?:              string;
    companyId:        string;
    source:           IntegrationSource;
    debitAccountId:   string;
    creditAccountId:  string;
    amountField:      string;
    description:      string;
    isActive:         boolean;
}

export interface IIntegrationRuleRepository {
    findByCompany(companyId: string, source?: IntegrationSource): Promise<Result<IntegrationRule[]>>;
    save(input: SaveIntegrationRuleInput): Promise<Result<string>>;
    delete(ruleId: string): Promise<Result<void>>;
}
