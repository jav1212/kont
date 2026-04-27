// Domain entity: PeriodClose — represents a closed accounting period.
export interface PeriodClose {
  id?: string;
  companyId: string;
  period: string;
  closedAt?: string;
  notes: string;
  dollarRate?: number | null;
}
