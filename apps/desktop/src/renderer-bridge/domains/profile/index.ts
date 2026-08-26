/** Current user profile state used by the Desktop shell. */
export type DesktopCurrentUserState =
  | { readonly status: "loading" }
  | { readonly status: "unavailable" }
  | {
      readonly status: "ready";
      readonly user: {
        readonly userId: string;
        readonly email: string | null;
        readonly displayName: string | null;
        readonly avatarUrl: string | null;
      };
    };
export interface DesktopProfileApi {
  getCurrent(): Promise<DesktopCurrentUserState>;
  subscribe(listener: (state: DesktopCurrentUserState) => void): () => void;
}
