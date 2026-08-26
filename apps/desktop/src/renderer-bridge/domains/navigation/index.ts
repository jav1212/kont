/** External destinations explicitly allowed by the main process. */
export type DesktopExternalDestination =
  | "settings"
  | "profile"
  | "help"
  | "billing"
  | "status";
export type DesktopExternalNavigationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly message: string } };
export interface DesktopNavigationApi {
  openExternal(
    destination: DesktopExternalDestination,
  ): Promise<DesktopExternalNavigationResult>;
}
