import assert from "node:assert/strict";
import test from "node:test";
import {
  DesktopSecureStorage,
  type DesktopSecureStorageDependencies,
} from "./desktop-secure-storage";

test("serializes interleaved writes across adapters sharing one file", async () => {
  const files = new Map<string, string>();
  const temporaries: string[] = [];
  let sequence = 0;
  const dependencies = {
    resolveUserDataPath: () => "/test",
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
    assertEncryptionAvailable: () => undefined,
    mkdir: async () => undefined,
    readFile: async (path: unknown) => {
      const value = files.get(String(path));
      if (value === undefined)
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return value as never;
    },
    writeFile: async (path: unknown, value: unknown) => {
      temporaries.push(String(path));
      files.set(String(path), String(value));
    },
    rename: async (from: unknown, to: unknown) => {
      files.set(String(to), files.get(String(from))!);
      files.delete(String(from));
    },
    unlink: async (path: unknown) => { files.delete(String(path)); },
    temporaryName: () => `tmp-${++sequence}`,
  } as unknown as DesktopSecureStorageDependencies;
  const first = new DesktopSecureStorage(dependencies);
  const second = new DesktopSecureStorage(dependencies);
  await Promise.all([first.setItem("a", "one"), second.setItem("b", "two")]);
  assert.equal(await first.getItem("a"), "one");
  assert.equal(await second.getItem("b"), "two");
  assert.equal(new Set(temporaries).size, temporaries.length);
});

test("cleans up its unique temporary file when an atomic rename fails", async () => {
  const files = new Map<string, string>();
  const removed: string[] = [];
  const storage = new DesktopSecureStorage({
    resolveUserDataPath: () => "/test",
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
    assertEncryptionAvailable: () => undefined,
    mkdir: async () => undefined,
    readFile: async () => { const error = Object.assign(new Error("missing"), { code: "ENOENT" }); throw error; },
    writeFile: async (path: unknown, value: unknown) => { files.set(String(path), String(value)); },
    rename: async () => { throw new Error("disk rename failure"); },
    unlink: async (path: unknown) => { removed.push(String(path)); files.delete(String(path)); },
    temporaryName: () => "unique",
  } as never);

  await assert.rejects(storage.setItem("session", "secret"), /disk rename failure/);
  assert.deepEqual(removed, ["/test/secure-auth-session.json.unique.tmp"]);
  assert.equal(files.size, 0);
});

test("cleans up a partially written temporary file", async () => {
  const files = new Map<string, string>();
  const removed: string[] = [];
  const storage = new DesktopSecureStorage({
    resolveUserDataPath: () => "/test",
    encrypt: (value: string) => Buffer.from(value),
    decrypt: (value: Buffer) => value.toString(),
    assertEncryptionAvailable: () => undefined,
    mkdir: async () => undefined,
    readFile: async () => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    },
    writeFile: async (path: unknown, value: unknown) => {
      files.set(String(path), String(value));
      throw new Error("disk write failure");
    },
    rename: async () => undefined,
    unlink: async (path: unknown) => {
      removed.push(String(path));
      files.delete(String(path));
    },
    temporaryName: () => "partial",
  } as never);

  await assert.rejects(storage.setItem("session", "secret"), /disk write failure/);
  assert.deepEqual(removed, ["/test/secure-auth-session.json.partial.tmp"]);
  assert.equal(files.size, 0);
});
