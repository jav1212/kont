export interface CestaTicketReceipt {
    id:              string;
    runId:           string;
    companyId:       string;
    employeeId?:     string;   // cedula (PK in employees)
    employeeCedula:  string;
    employeeNombre:  string;
    employeeCargo:   string;
    montoUsd:        number;   // snapshot por empleado
    montoVes:        number;   // = montoUsd × exchangeRate del run, denormalizado
    createdAt:       string;
}
