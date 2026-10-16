import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CompanyLogoStorage } from "../../application";
import { CompanyFailure, companyLogoFile, companyLogoUrl, type CompanyId, type CompanyLogoFile } from "../../domain";
import type { OrganizationId } from "@kontave/organizations/domain";

const COMPANY_LOGO_BUCKET = "company-logos";
const ORGANIZATION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Credentials required by the trusted server-only company-logo storage adapter. */
export interface CompanyLogoSupabaseConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
}

/** Narrow injectable Supabase Storage boundary for logo persistence tests. */
export interface CompanyLogoStorageSource {
  /**
   * Uploads an object to the configured storage bucket.
   * @param bucket - Dedicated company-logo bucket name.
   * @param path - Tenant-isolated object path.
   * @param bytes - Image payload.
   * @param contentType - Verified MIME type.
   * @returns Nothing when the object is durable.
   * @throws {Error} When Supabase Storage rejects the request.
   */
  upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /**
   * Deletes one exact object from the configured bucket.
   * @param bucket - Dedicated company-logo bucket name.
   * @param path - Tenant-isolated object path.
   * @returns Nothing after Storage confirms deletion.
   * @throws {Error} When Supabase Storage rejects the request.
   */
  remove(bucket: string, path: string): Promise<void>;
}

/** Service-role Storage adapter for public company-logo reads and server-only writes. */
export class SupabaseCompanyLogoStorage implements CompanyLogoStorage {
  private readonly publicOrigin: string;

  /**
   * @param publicUrl - Supabase project URL used exclusively to build the public-read object address.
   * @param source - Service-role Storage source; no browser client can construct this adapter.
   * @throws {CompanyFailure} When the project URL is not an HTTPS origin.
   */
  constructor(publicUrl: string, private readonly source: CompanyLogoStorageSource) {
    try {
      const origin = new URL(publicUrl);
      if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) throw new TypeError("Supabase URL must be an HTTPS origin.");
      this.publicOrigin = origin.origin;
    } catch (cause: unknown) {
      throw new CompanyFailure("COMPANY_LOGO_STORAGE_UNAVAILABLE", "The company-logo storage origin is invalid.", { cause });
    }
  }

  /** {@inheritDoc CompanyLogoStorage.upload} */
  async upload(scope: { readonly organizationId: OrganizationId; readonly companyId: CompanyId }, file: CompanyLogoFile): Promise<string> {
    const valid = companyLogoFile(file);
    const path = this.newPath(scope.organizationId, scope.companyId, valid.contentType);
    try {
      await this.source.upload(COMPANY_LOGO_BUCKET, path, valid.bytes, valid.contentType);
      return companyLogoUrl(`${this.publicOrigin}/storage/v1/object/public/${COMPANY_LOGO_BUCKET}/${path}`)!;
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw new CompanyFailure("COMPANY_LOGO_STORAGE_UNAVAILABLE", "The company logo could not be uploaded.", { cause });
    }
  }

  /** {@inheritDoc CompanyLogoStorage.remove} */
  async remove(scope: { readonly organizationId: OrganizationId; readonly companyId: CompanyId }, logoUrl: string): Promise<void> {
    let path: string | null;
    try {
      path = this.pathFromUrl(scope.organizationId, scope.companyId, logoUrl);
      // Existing company rows can reference files uploaded before the dedicated
      // bucket existed. They remain displayable but are deliberately outside
      // this adapter's authority and must never block a persisted replacement.
      if (path === null) return;
      await this.source.remove(COMPANY_LOGO_BUCKET, path);
    } catch (cause: unknown) {
      if (cause instanceof CompanyFailure) throw cause;
      throw new CompanyFailure("COMPANY_LOGO_STORAGE_UNAVAILABLE", "The company logo could not be removed.", { cause });
    }
  }

  private newPath(organizationId: OrganizationId, id: CompanyId, contentType: CompanyLogoFile["contentType"]): string {
    this.assertOrganizationId(organizationId);
    const extension = contentType === "image/png" ? "png" : contentType === "image/jpeg" ? "jpg" : "webp";
    return `${organizationId}/${companyPathSegment(id)}/${globalThis.crypto.randomUUID()}.${extension}`;
  }

  private pathFromUrl(organizationId: OrganizationId, id: CompanyId, logoUrl: string): string | null {
    this.assertOrganizationId(organizationId);
    const url = new URL(companyLogoUrl(logoUrl)!);
    if (url.origin !== this.publicOrigin || url.search || url.hash) return null;
    const prefix = `/storage/v1/object/public/${COMPANY_LOGO_BUCKET}/${organizationId}/${companyPathSegment(id)}/`;
    if (!url.pathname.startsWith(prefix)) return null;
    const leaf = url.pathname.slice(prefix.length);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$/i.test(leaf)) {
      return null;
    }
    return `${organizationId}/${companyPathSegment(id)}/${leaf}`;
  }

  private assertOrganizationId(value: OrganizationId): void {
    if (!ORGANIZATION_UUID.test(value)) throw new CompanyFailure("COMPANY_LOGO_INVALID", "The company-logo organization identifier is invalid.");
  }
}

/**
 * Creates a server-only Storage adapter backed by a Supabase service-role client.
 * @param configuration - HTTPS project URL and service-role key kept outside browser bundles.
 * @returns A company-logo storage port restricted to the dedicated bucket and tenant path format.
 * @throws {CompanyFailure} When the configuration URL is invalid or Storage fails during an operation.
 */
export function createCompanyLogoStorage(configuration: CompanyLogoSupabaseConfiguration): CompanyLogoStorage {
  const client = createClient(configuration.url, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabaseCompanyLogoStorage(configuration.url, new SupabaseClientCompanyLogoStorageSource(client));
}

class SupabaseClientCompanyLogoStorageSource implements CompanyLogoStorageSource {
  constructor(private readonly client: SupabaseClient) {}

  async upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
    if (error) throw error;
  }

  async remove(bucket: string, path: string): Promise<void> {
    const { error } = await this.client.storage.from(bucket).remove([path]);
    if (error) throw error;
  }
}

function companyPathSegment(companyId: CompanyId): string {
  return Array.from(new TextEncoder().encode(companyId), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
