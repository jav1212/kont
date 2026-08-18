import { KontaveRemoteClient } from "@kontave/client-remote";
import Constants from "expo-constants";

export function createMobileApi(authenticatedFetch: (input: URL | string, init?: RequestInit) => Promise<Response>): KontaveRemoteClient {
  return new KontaveRemoteClient({
    baseUrl: typeof Constants.expoConfig?.extra?.apiBaseUrl === "string" ? Constants.expoConfig.extra.apiBaseUrl : "https://kontave.com",
    platform: "mobile",
    authenticatedRequest: authenticatedFetch,
  });
}
