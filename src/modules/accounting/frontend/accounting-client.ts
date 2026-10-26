import { KontaveRemoteClient, RemoteAccountingPort } from "@kontave/client-remote";
import { getSupabaseBrowser } from "@/src/shared/frontend/utils/supabase-browser";

/** Creates the authenticated Web adapter for accounting commands and queries.
 * @returns A remote port that resolves the current Supabase token per request.
 * @throws Never during construction; session and network failures surface on use.
 */
export function createWebAccountingClient(): RemoteAccountingPort {
  const baseUrl = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return new RemoteAccountingPort(new KontaveRemoteClient({
    baseUrl,
    platform: "web",
    getAccessToken: async () => (await getSupabaseBrowser().auth.getSession()).data.session?.access_token ?? null,
  }));
}
