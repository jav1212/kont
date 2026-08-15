import AsyncStorage from "@react-native-async-storage/async-storage";

const rememberedEmailKey = "kontave.mobile.remembered-email";

export async function readRememberedEmail(): Promise<string | null> {
  const value = (await AsyncStorage.getItem(rememberedEmailKey))?.trim();
  return value || null;
}

export function writeRememberedEmail(email: string | null): Promise<void> {
  const value = email?.trim();
  return value ? AsyncStorage.setItem(rememberedEmailKey, value) : AsyncStorage.removeItem(rememberedEmailKey);
}
