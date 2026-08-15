import AsyncStorage from "@react-native-async-storage/async-storage";

export function readMobileSelection(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key);
}

export function writeMobileSelection(key: string, value: string | null): Promise<void> {
  return value === null ? AsyncStorage.removeItem(key) : AsyncStorage.setItem(key, value);
}
