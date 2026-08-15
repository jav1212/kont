const rememberedEmailKey = "kontave.mobile.remembered-email";

export function readRememberedEmail(): Promise<string | null> {
  const value = globalThis.localStorage?.getItem(rememberedEmailKey)?.trim();
  return Promise.resolve(value || null);
}

export function writeRememberedEmail(email: string | null): Promise<void> {
  const value = email?.trim();
  if (value) globalThis.localStorage?.setItem(rememberedEmailKey, value);
  else globalThis.localStorage?.removeItem(rememberedEmailKey);
  return Promise.resolve();
}
