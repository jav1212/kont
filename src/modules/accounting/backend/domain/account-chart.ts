// Domain entity: plan de cuentas (chart of accounts header).
// A chart groups a set of accounts imported together for a company.
// One company may hold up to plan-limit charts; Empresarial is unlimited.

export interface AccountChart {
    id:           string;
    companyId:    string;
    name:         string;
    accountCount: number;
    createdAt:    string;
    updatedAt:    string;
}
