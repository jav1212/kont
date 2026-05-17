export interface BonificacionesRun {
    id:             string;
    companyId:      string;
    periodStart:    string;   // ISO date "YYYY-MM-DD"
    periodEnd:      string;   // ISO date "YYYY-MM-DD"
    exchangeRate:   number;   // tasa BCV congelada al guardar
    totalVes:       number;   // agregado: Σ (totalVes por empleado)
    employeeCount:  number;   // cuántos empleados recibieron bonos
    lineCount:      number;   // cuántos conceptos de bono distintos
    status:         string;   // "draft" | "confirmed"
    confirmedAt:    string;   // ISO timestamp (reused as "last saved at" for drafts)
    createdAt:      string;   // ISO timestamp
}
