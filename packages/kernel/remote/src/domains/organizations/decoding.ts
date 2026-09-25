import type {
  OrganizationDto,
  AccessibleOrganizationDto,
  WorkspaceRelationshipDto,
  OrganizationAccessPathDto,
  OrganizationCompanyDto,
  CompanyDto,
  AvailableOrganizationModuleDto,
  OrganizationMemberDto,
  RoleDto,
} from "@kontave/client-contracts";
import type { Decoder } from "../../decoding";
import {
  textField,
  numberField,
  shape,
  list,
  nullOr,
  literal,
  responseDto,
  type ResponseField,
} from "../../response-shape";

const organizationDtoShape: ResponseField<OrganizationDto> =
  shape<OrganizationDto>({
    id: textField,
    name: textField,
    slug: textField,
    role: literal("owner", "admin", "accountant", "seller", "cashier"),
    permissions: list(textField),
    logoUrl: nullOr(textField),
    version: numberField,
  });

const workspaceRelationshipDtoShape: ResponseField<WorkspaceRelationshipDto> =
  literal("personal", "member", "delegated");

const organizationAccessPathDtoShape: ResponseField<OrganizationAccessPathDto> =
  shape<OrganizationAccessPathDto>({
    kind: textField,
    actorUserId: textField,
    actingOrganizationId: textField,
    targetOrganizationId: textField,
    delegationId: nullOr(textField),
    scopes: list(textField),
  });

const accessibleOrganizationDtoShape: ResponseField<AccessibleOrganizationDto> =
  shape<AccessibleOrganizationDto>({
    organizationId: textField,
    name: textField,
    avatarUrl: nullOr(textField),
    relationship: workspaceRelationshipDtoShape,
    permissions: list(textField),
    accessPath: organizationAccessPathDtoShape,
  });

const organizationCompanyDtoShape: ResponseField<OrganizationCompanyDto> =
  shape<OrganizationCompanyDto>({
    id: textField,
    organizationId: textField,
    name: textField,
    rif: nullOr(textField),
    logoUrl: nullOr(textField),
    operatingProfile: literal("standard", "kiosk"),
  });

const companyDtoShape: ResponseField<CompanyDto> = shape<CompanyDto>({
  id: textField,
  organizationId: textField,
  legacyCompanyId: nullOr(textField),
  legalName: textField,
  tradeName: nullOr(textField),
  taxId: nullOr(textField),
  country: textField,
  status: textField,
  operatingProfile: literal("standard", "kiosk"),
});

const availableOrganizationModuleDtoShape: ResponseField<AvailableOrganizationModuleDto> =
  shape<AvailableOrganizationModuleDto>({
    id: textField,
    code: literal(
      "payroll",
      "purchases",
      "sales",
      "inventory",
      "accounting",
      "tools",
      "companies",
      "documents",
    ),
    name: textField,
  });

const organizationMemberDtoShape: ResponseField<OrganizationMemberDto> =
  shape<OrganizationMemberDto>({
    id: textField,
    kind: literal("membership", "invitation"),
    organizationId: textField,
    userId: nullOr(textField),
    email: textField,
    displayName: nullOr(textField),
    avatarUrl: nullOr(textField),
    roleId: textField,
    roleName: textField,
    status: literal("active", "invited", "suspended"),
    version: numberField,
    joinedAt: nullOr(textField),
    invitedAt: nullOr(textField),
    expiresAt: nullOr(textField),
  });

const roleDtoShape: ResponseField<RoleDto> = shape<RoleDto>({
  id: textField,
  organizationId: textField,
  code: textField,
  name: textField,
  description: textField,
  kind: literal("system", "custom"),
  permissions: list(textField),
  status: literal("active", "archived"),
  version: numberField,
});

/**
 * Validates the complete OrganizationDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const organization: Decoder<OrganizationDto> =
  responseDto(organizationDtoShape);

/**
 * Validates the complete AccessibleOrganizationDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const accessibleOrganization: Decoder<AccessibleOrganizationDto> =
  responseDto(accessibleOrganizationDtoShape);

/**
 * Validates the complete OrganizationCompanyDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const company: Decoder<OrganizationCompanyDto> = (value) =>
  responseDto(organizationCompanyDtoShape)(withLegacyCompanyProfile(value));

/**
 * Validates the complete CompanyDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const operationalCompany: Decoder<CompanyDto> = (value) =>
  responseDto(companyDtoShape)(withLegacyCompanyProfile(value));

/**
 * Supplies the standard experience for responses from servers predating profiles.
 * @param value - Untrusted company response; explicit invalid profiles remain invalid.
 * @returns The response with an additive default only when the field is absent.
 */
function withLegacyCompanyProfile(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.hasOwn(value, "operatingProfile") ? value : { ...value, operatingProfile: "standard" };
}

/**
 * Validates the complete AvailableOrganizationModuleDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const organizationModule: Decoder<AvailableOrganizationModuleDto> =
  responseDto(availableOrganizationModuleDtoShape);

/**
 * Validates the complete OrganizationMemberDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const member: Decoder<OrganizationMemberDto> = responseDto(
  organizationMemberDtoShape,
);

/**
 * Validates the complete RoleDto response shape.
 * @param value - Untrusted response data.
 * @returns The validated DTO or null for malformed data, preserving exact strings and additive fields.
 */
export const role: Decoder<RoleDto> = responseDto(roleDtoShape);
