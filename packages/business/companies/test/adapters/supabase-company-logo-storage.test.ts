import assert from "node:assert/strict";
import test from "node:test";
import { organizationId } from "@kontave/organizations/domain";
import { CompanyFailure, companyId } from "../../src/domain";
import { SupabaseCompanyLogoStorage, type CompanyLogoStorageSource } from "../../src/adapters/supabase";

const organization = organizationId("11111111-1111-4111-8111-111111111111");
const company = companyId("RIF-Á");
const png = { contentType: "image/png" as const, bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) };

test("service storage writes a UUID organization and UTF-8 hexadecimal company path without rewriting legacy identifier case", async () => {
  const calls: string[] = [];
  const storage = new SupabaseCompanyLogoStorage("https://project.supabase.co", {
    async upload(bucket, path) { calls.push(`${bucket}:${path}`); },
    async remove() {},
  });
  const url = await storage.upload({ organizationId: organization, companyId: company }, png);
  assert.match(url, /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/company-logos\/11111111-1111-4111-8111-111111111111\/5249462dc381\/[0-9a-f-]{36}\.png$/);
  assert.match(calls[0]!, /^company-logos:11111111-1111-4111-8111-111111111111\/5249462dc381\/[0-9a-f-]{36}\.png$/);
});

test("service storage retains a cross-company or legacy URL without issuing a delete", async () => {
  const source = new RecordingSource();
  const storage = new SupabaseCompanyLogoStorage("https://project.supabase.co", source);
  await storage.remove({ organizationId: organization, companyId: company }, "https://project.supabase.co/storage/v1/object/public/company-logos/11111111-1111-4111-8111-111111111111/other/11111111-1111-4111-8111-111111111111.png");
  await storage.remove({ organizationId: organization, companyId: company }, "https://legacy.example.com/company-logo.png");
  assert.deepEqual(source.removed, []);
});

test("storage errors map to a typed expected failure", async () => {
  const storage = new SupabaseCompanyLogoStorage("https://project.supabase.co", { async upload() { throw new Error("offline"); }, async remove() {} });
  await assert.rejects(() => storage.upload({ organizationId: organization, companyId: company }, png), (error: unknown) => error instanceof CompanyFailure && error.code === "COMPANY_LOGO_STORAGE_UNAVAILABLE");
});

class RecordingSource implements CompanyLogoStorageSource {
  readonly removed: string[] = [];
  async upload(): Promise<void> {}
  async remove(_bucket: string, path: string): Promise<void> { this.removed.push(path); }
}
