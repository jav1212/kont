import * as electron from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SupportedStorage } from "@supabase/supabase-js";

const fileOperations = new Map<string, Promise<void>>();

/** Native facilities required by Desktop secure storage. */
export interface DesktopSecureStorageDependencies {
  /** @returns Electron's user-data directory used for the encrypted file. */
  readonly resolveUserDataPath: () => string;
  /** @param value - Plain session value. @returns Encrypted bytes. */
  readonly encrypt: (value: string) => Buffer;
  /** @param value - Encrypted session bytes. @returns Decrypted session value. */
  readonly decrypt: (value: Buffer) => string;
  /** @throws Error when OS-backed encryption is unavailable. */
  readonly assertEncryptionAvailable: () => void;
  readonly mkdir: typeof mkdir;
  readonly readFile: typeof readFile;
  readonly rename: typeof rename;
  readonly unlink: typeof rm;
  readonly writeFile: typeof writeFile;
  readonly temporaryName: () => string;
}

/**
 * Implements Supabase session persistence using Electron safeStorage and an atomic file.
 *
 * Calls are serialized per instance so concurrent writes preserve all keys. Values are
 * encrypted before they reach disk; this adapter must remain in Electron main only.
 */
export class DesktopSecureStorage implements SupportedStorage {
  private readonly dependencies: DesktopSecureStorageDependencies;
  private readonly filePath: string;

  /**
   * Creates encrypted session storage backed by the current Electron user-data directory.
   * @param overrides - Optional native dependencies used only by focused adapter tests.
   */
  constructor(overrides: Partial<DesktopSecureStorageDependencies> = {}) {
    this.dependencies = { ...electronDependencies(), ...overrides };
    this.filePath = join(this.dependencies.resolveUserDataPath(), "secure-auth-session.json");
  }

  /**
   * Restores one decrypted session value.
   * @param key - Storage key selected by Supabase.
   * @returns The stored plaintext, or null when no value is present.
   * @throws Error when the encrypted file cannot be read or decrypted.
   */
  async getItem(key: string): Promise<string | null> {
    return this.enqueue(async () => {
      const values = await this.readValues();
      const encrypted = values[key];
      return encrypted
        ? this.dependencies.decrypt(Buffer.from(encrypted, "base64"))
        : null;
    });
  }

  /**
   * Atomically encrypts and persists one session value.
   * @param key - Storage key selected by Supabase.
   * @param value - Plaintext session value to encrypt.
   * @returns Nothing after the renamed file is durable to the filesystem adapter.
   * @throws Error when system encryption or filesystem persistence is unavailable.
   */
  async setItem(key: string, value: string): Promise<void> {
    await this.enqueue(async () => {
      this.dependencies.assertEncryptionAvailable();
      const values = await this.readValues();
      values[key] = this.dependencies.encrypt(value).toString("base64");
      await this.writeValues(values);
    });
  }

  /**
   * Atomically removes one encrypted session value while preserving other keys.
   * @param key - Storage key selected by Supabase.
   * @returns Nothing after the replacement file is persisted.
   * @throws Error when the encrypted file cannot be read or replaced.
   */
  async removeItem(key: string): Promise<void> {
    await this.enqueue(async () => {
      const values = await this.readValues();
      delete values[key];
      await this.writeValues(values);
    });
  }

  private async readValues(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await this.dependencies.readFile(this.filePath, "utf8")) as Record<
        string,
        string
      >;
    } catch (cause: unknown) {
      if (isMissingFile(cause)) return {};
      throw cause;
    }
  }

  private async writeValues(values: Record<string, string>): Promise<void> {
    await this.dependencies.mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${this.dependencies.temporaryName()}.tmp`;
    try {
      await this.dependencies.writeFile(temporaryPath, JSON.stringify(values), {
        encoding: "utf8",
        mode: 0o600,
      });
      await this.dependencies.rename(temporaryPath, this.filePath);
    } catch (cause: unknown) {
      await this.dependencies.unlink(temporaryPath, { force: true });
      throw cause;
    }
  }

  /** Serializes operations by file so separate adapter instances cannot lose session keys. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = fileOperations.get(this.filePath) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    fileOperations.set(this.filePath, settled);
    void settled.then(() => {
      if (fileOperations.get(this.filePath) === settled)
        fileOperations.delete(this.filePath);
    });
    return result;
  }
}

/** Creates the production Electron and Node implementation dependencies. */
function electronDependencies(): DesktopSecureStorageDependencies {
  return {
    resolveUserDataPath: () => electron.app.getPath("userData"),
    encrypt: (value) => electron.safeStorage.encryptString(value),
    decrypt: (value) => electron.safeStorage.decryptString(value),
    assertEncryptionAvailable: () => {
      if (!electron.safeStorage.isEncryptionAvailable())
        throw new Error("El almacenamiento seguro del sistema no está disponible.");
    },
    mkdir, readFile, rename, unlink: rm, writeFile,
    temporaryName: () => crypto.randomUUID(),
  };
}

function isMissingFile(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
