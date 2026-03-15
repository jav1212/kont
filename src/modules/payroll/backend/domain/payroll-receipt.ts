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
