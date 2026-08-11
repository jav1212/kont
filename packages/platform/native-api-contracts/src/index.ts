export type NativeApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_ACCESS_TOKEN"
  | "INVALID_REQUEST"
  | "ORGANIZATION_NOT_FOUND"
  | "ORGANIZATION_ACCESS_DENIED"
  | "COMPANY_NOT_FOUND"
  | "COMPANY_ACCESS_DENIED"
  | "METHOD_NOT_ALLOWED"
  | "INTERNAL_ERROR";

export interface NativeApiMeta {
  readonly requestId: string;
}

export interface NativeApiSuccess<T> {
  readonly data: T;
  readonly meta: NativeApiMeta;
}

export interface NativeApiError {
  readonly error: {
    readonly code: NativeApiErrorCode;
    readonly message: string;
    readonly requestId: string;
  };
}

export interface NativeAuthenticatedUserDto {
  readonly id: string;
  readonly email: string | null;
}

export interface NativeSessionDto {
  readonly user: NativeAuthenticatedUserDto;
}

export interface NativeOrganizationDto {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly role: "owner" | "admin" | "accountant" | "seller" | "cashier";
  readonly permissions: readonly string[];
}

export interface NativeOrganizationCompanyDto {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly rif: string | null;
}
