import { NativeApiClient } from "@kontave/native-api-client";
import Constants from "expo-constants";

export function createMobileApi(authenticatedFetch: (input: URL | string, init?: RequestInit) => Promise<Response>): NativeApiClient {
  return new NativeApiClient({
    baseUrl: typeof Constants.expoConfig?.extra?.apiBaseUrl === "string" ? Constants.expoConfig.extra.apiBaseUrl : "https://kontave.com",
    client: "mobile",
    authenticatedFetch,
  });
}
