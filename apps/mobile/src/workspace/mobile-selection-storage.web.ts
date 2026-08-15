export function readMobileSelection(key: string): Promise<string | null> {
  return Promise.resolve(globalThis.localStorage?.getItem(key) ?? null);
}

export function writeMobileSelection(key: string, value: string | null): Promise<void> {
  if (value === null) globalThis.localStorage?.removeItem(key);
  else globalThis.localStorage?.setItem(key, value);
  return Promise.resolve();
}
