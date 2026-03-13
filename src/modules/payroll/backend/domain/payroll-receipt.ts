export interface ReceiptCalculationData {
    gross:          number;
    netUsd:         number;
    mondaysInMonth: number;
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
