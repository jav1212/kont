// Cada línea del desglose de bonos guardado en el recibo. Snapshot — los
// montos quedan congelados en el momento del save/confirm.
export interface BonificacionesBonusLineSnapshot {
    label:     string;
    currency:  "USD" | "VES";
    amount:    number;   // monto en la moneda original
    amountVes: number;   // equivalente en bolívares al momento del save
}

export interface BonificacionesReceipt {
    id:              string;
    runId:           string;
    companyId:       string;
    employeeId?:     string;
    employeeCedula:  string;
    employeeNombre:  string;
    employeeCargo:   string;
    totalVes:        number;                              // Σ amountVes
    bonusLines:      BonificacionesBonusLineSnapshot[];   // desglose congelado
    createdAt:       string;
}
