import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { SupportedStorage } from "@supabase/supabase-js";

const keyPrefix = "kontave.mobile.auth.";

/** Keeps Supabase session material in the OS credential store, never in AsyncStorage. */
export class MobileSecureStorage implements SupportedStorage {
  getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return Promise.resolve(globalThis.localStorage?.getItem(storageKey(key)) ?? null);
    return SecureStore.getItemAsync(storageKey(key));
  }
  setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") { globalThis.localStorage?.setItem(storageKey(key), value); return Promise.resolve(); }
    return SecureStore.setItemAsync(storageKey(key), value);
  }
  removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") { globalThis.localStorage?.removeItem(storageKey(key)); return Promise.resolve(); }
    return SecureStore.deleteItemAsync(storageKey(key));
  }
}

function storageKey(key: string): string {
  return `${keyPrefix}${key.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}
