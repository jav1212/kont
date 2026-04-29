export interface ReceiptComputedLine {
    label:   string;
    formula: string;
    amount:  number;
}

export interface ReceiptCalculationData {
    gross:              number;
    netUsd:             number;
    mondaysInMonth:     number;
    // Sprint 2: alícuotas (opcionales para compatibilidad con recibos anteriores)
    diasUtilidades?:    number;
    diasBonoVacacional?: number;
    alicuotaUtil?:      number;
    alicuotaBono?:      number;
    salarioIntegral?:   number;
    // Sprint 3: desglose por línea persistido para reconstruir el recibo desde
    // el historial (incluye fórmulas). Opcional — los recibos antiguos sólo
    // exponen los totales agregados.
    earningLines?:      ReceiptComputedLine[];
    bonusLines?:        ReceiptComputedLine[];
    deductionLines?:    ReceiptComputedLine[];
}

export interface PayrollReceipt {
    id:               string;
    runId:            string;
    companyId:        string;
    employeeId?:      string;   // cedula (PK in employees)
    employeeCedula:   string;
    employeeNombre:   string;
    employeeCargo:    string;
    monthlySalary:    number;
    totalEarnings:    number;
    totalDeductions:  number;
    totalBonuses:     number;
    netPay:           number;
    calculationData:  ReceiptCalculationData;
    createdAt:        string;
}
