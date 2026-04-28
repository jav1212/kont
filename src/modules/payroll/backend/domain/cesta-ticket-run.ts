export interface CestaTicketRun {
    id:           string;
    companyId:    string;
    periodStart:  string;   // ISO date "YYYY-MM-DD"
    periodEnd:    string;   // ISO date "YYYY-MM-DD"
    montoUsd:     number;   // monto por empleado, USD
    exchangeRate: number;   // tasa BCV congelada al guardar
    status:       string;   // "draft" | "confirmed"
    confirmedAt:  string;   // ISO timestamp (reused as "last saved at" for drafts)
    createdAt:    string;   // ISO timestamp
}
