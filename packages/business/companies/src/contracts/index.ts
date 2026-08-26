export interface CompanyDto {
  readonly id: string;
  readonly organizationId: string;
  readonly legacyCompanyId: string | null;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string | null;
  readonly country: string;
  readonly status: string;
}
