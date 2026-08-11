import { AuthorizationSource } from "@kontave/access-control-domain";

const NATIVE_SOURCES = new Map<string, AuthorizationSource>([
  [AuthorizationSource.Desktop, AuthorizationSource.Desktop],
  [AuthorizationSource.Mobile, AuthorizationSource.Mobile],
  [AuthorizationSource.Web, AuthorizationSource.Web],
  [AuthorizationSource.System, AuthorizationSource.System],
]);

export function nativeClientSource(value: string | null): AuthorizationSource {
  return value ? NATIVE_SOURCES.get(value) ?? AuthorizationSource.Desktop : AuthorizationSource.Desktop;
}
