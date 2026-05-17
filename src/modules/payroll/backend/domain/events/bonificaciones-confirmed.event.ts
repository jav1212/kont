// BonificacionesConfirmedPayload — emitted after a bonificaciones run is successfully confirmed.
export interface BonificacionesConfirmedPayload {
    bonificacionesRunId: string;
    companyId:           string;
    periodStart:         string;
    periodEnd:           string;
    employeeCount:       number;
    lineCount:           number;
    totalVes:            number;
}
