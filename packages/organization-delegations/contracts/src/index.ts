export interface OrganizationAccessPathDto {
  readonly kind: string;
  readonly actorUserId: string;
  readonly actingOrganizationId: string;
  readonly targetOrganizationId: string;
  readonly delegationId: string | null;
  readonly scopes: readonly string[];
}

export interface AccessibleOrganizationDto {
  readonly organizationId: string;
  readonly name: string;
  readonly accessPath: OrganizationAccessPathDto;
}

export interface OrganizationDelegationDto {
  readonly id: string;
  readonly providerOrganizationId: string;
  readonly clientOrganizationId: string;
  readonly status: string;
  readonly scopes: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly acceptedAt: string | null;
  readonly suspendedAt: string | null;
  readonly revokedAt: string | null;
}
