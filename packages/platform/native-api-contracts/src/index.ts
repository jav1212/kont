export type NativeApiErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_ACCESS_TOKEN"
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
