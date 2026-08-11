import { app, safeStorage } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SupportedStorage } from "@supabase/supabase-js";

export class DesktopSecureStorage implements SupportedStorage {
  private readonly filePath = join(app.getPath("userData"), "secure-auth-session.json");

  async getItem(key: string): Promise<string | null> {
    const values = await this.readValues();
    const encrypted = values[key];
    if (!encrypted) return null;
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  }

  async setItem(key: string, value: string): Promise<void> {
    this.assertEncryptionAvailable();
    const values = await this.readValues();
    values[key] = safeStorage.encryptString(value).toString("base64");
    await this.writeValues(values);
  }

  async removeItem(key: string): Promise<void> {
    const values = await this.readValues();
    delete values[key];
    await this.writeValues(values);
  }

  private async readValues(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as Record<string, string>;
    } catch (cause: unknown) {
      if (isMissingFile(cause)) return {};
      throw cause;
    }
  }

  private async writeValues(values: Record<string, string>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(values), { encoding: "utf8", mode: 0o600 });
    try {
      await rename(temporaryPath, this.filePath);
    } catch (cause: unknown) {
      await rm(temporaryPath, { force: true });
      throw cause;
    }
  }

  private assertEncryptionAvailable(): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error("El almacenamiento seguro del sistema no está disponible.");
  }
}

function isMissingFile(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
