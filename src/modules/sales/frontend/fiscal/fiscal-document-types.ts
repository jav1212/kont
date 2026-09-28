/** JSON-safe projections of the fiscal persistence codec; amounts remain integer strings. */
export interface FiscalMoneyDto {
  readonly minorAmount: string;
  readonly currency: { readonly code: string; readonly minorUnit: number };
}

export interface FiscalDocumentDto {
  readonly id: string;
  readonly type: string;
  readonly direction: string;
  readonly status: "draft" | "issued" | "received";
  readonly jurisdiction: string;
  readonly documentCurrency: { readonly code: string; readonly minorUnit: number };
  readonly issuer: FiscalPartyDto;
  readonly recipient: FiscalPartyDto;
  readonly lines: readonly FiscalLineDto[];
  readonly totals: FiscalTotalsDto;
  readonly taxDeterminations: readonly FiscalTaxDto[];
  readonly issuanceEvidence: FiscalEvidenceDto | null;
  readonly number: string | null;
  readonly issueDate: string | null;
  readonly issuedAt: string | null;
}

export interface FiscalPartyDto {
  readonly legalName: string;
  readonly taxIdentifier: string;
  readonly fiscalAddress: string | null;
}

export interface FiscalLineDto {
  readonly id: string;
  readonly description: string;
  readonly quantity: string;
  readonly unitCode: string;
  readonly unitPrice: FiscalMoneyDto;
  readonly grossAmount: FiscalMoneyDto;
  readonly netAmount: FiscalMoneyDto;
}

export interface FiscalTotalsDto {
  readonly grossAmount: FiscalMoneyDto;
  readonly discountTotal: FiscalMoneyDto;
  readonly surchargeTotal: FiscalMoneyDto;
  readonly netAmount: FiscalMoneyDto;
  readonly taxTotal: FiscalMoneyDto;
  readonly payableAmount: FiscalMoneyDto;
  readonly outstandingAmount: FiscalMoneyDto;
}

export interface FiscalTaxDto {
  readonly taxCode: string;
  readonly category: string;
  readonly rate: string;
  readonly taxableBase: FiscalMoneyDto;
  readonly amount: FiscalMoneyDto;
  readonly jurisdiction: string;
  readonly ruleVersion: string;
  readonly operationDate?: string;
  readonly legalBasis?: string;
  readonly classificationVersion?: string;
  readonly classificationLegalBasis?: string;
}

export interface FiscalEvidenceDto {
  readonly provider: string;
  readonly externalDocumentNumber: string;
  readonly authorization: string | null;
  readonly deviceRegistration: string | null;
}

export interface FiscalDocumentListItem {
  readonly document: FiscalDocumentDto;
  readonly createdAt: string;
}

export interface FiscalEventDto {
  readonly id: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: string;
  readonly recordedAt: string;
}
