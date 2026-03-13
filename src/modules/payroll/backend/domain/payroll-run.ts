export interface PayrollRun {
    id:           string;
    companyId:    string;
    periodStart:  string;   // ISO date "YYYY-MM-DD"
    periodEnd:    string;   // ISO date "YYYY-MM-DD"
    exchangeRate: number;   // BCV rate
    status:       string;   // "confirmed"
    confirmedAt:  string;   // ISO timestamp
    createdAt:    string;   // ISO timestamp
}
