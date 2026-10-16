import { companyId } from "@kontave/companies/domain";
import { SupabaseFiscalDocumentRepository } from "@kontave/fiscal/supabase";
import { ReviseFiscalDocument, type FiscalDraftCandidateBuilder } from "@kontave/fiscal/application";
import { ResolveProductVenezuelanVat, ResolveServiceVenezuelanVat } from "@kontave/taxation/application";
import {
  SupabaseProductTaxationRepository,
  SupabaseServiceTaxationRepository,
  SupabaseTaxationConfigurationRepository,
} from "@kontave/taxation/supabase";
import { GetServiceTaxProfile, SetServiceTaxTreatment } from "@kontave/taxation/application";
import { organizationId, userId } from "@kontave/organizations/domain";
import type { FiscalPersistenceScope } from "@kontave/fiscal/domain";
import { createSupabaseSalesFiscalReaders } from "./confirmed-service-invoice-reader";
import {
  PrepareConfirmedServiceInvoiceFiscalDocument,
} from "@kontave/sales/application";
import { SalesInvoiceLineVatAdapter } from "@kontave/sales/fiscal-taxation";
import { ServerSupabaseSource } from "@/src/shared/backend/source/infra/server-supabase";

/**
 * Creates the authorized service tax-classification administration command.
 * @returns A use case backed by service-role-only taxation RPCs.
 * @throws Error when server Supabase infrastructure is not configured.
 */
export function createServiceTaxationActions(): {
  readonly getProfile: GetServiceTaxProfile;
  readonly setTreatment: SetServiceTaxTreatment;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Service taxation infrastructure is not configured.");
  const repository = new SupabaseServiceTaxationRepository(new ServerSupabaseSource().instance);
  return {
    getProfile: new GetServiceTaxProfile(repository),
    setTreatment: new SetServiceTaxTreatment(repository),
  };
}

/**
 * Builds server-owned fiscal preparation dependencies for classified product and service invoices.
 * @param input - Authorized tenant, actor, organization, and company identifiers.
 * @returns Company scope and the fiscal preparation use case.
 * @throws Error when server Supabase infrastructure is not configured.
 */
export function createSalesFiscalActions(input: {
  readonly tenantId: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly companyId: string;
}): {
  readonly scope: FiscalPersistenceScope;
  readonly prepareConfirmedServiceInvoice: PrepareConfirmedServiceInvoiceFiscalDocument;
  readonly reviseFiscalDocument: ReviseFiscalDocument;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Sales fiscal infrastructure is not configured.");
  const scope: FiscalPersistenceScope = {
    tenantId: input.tenantId,
    organizationId: input.organizationId,
    companyId: companyId(input.companyId),
  };
  const readers = createSupabaseSalesFiscalReaders({ url, serviceRoleKey, tenantId: input.tenantId });
  const configuration = new SupabaseTaxationConfigurationRepository(readers.client);
  const productTaxation = new ResolveProductVenezuelanVat(
    new SupabaseProductTaxationRepository(readers.client),
    configuration,
  );
  const serviceTaxation = new ResolveServiceVenezuelanVat(
    new SupabaseServiceTaxationRepository(readers.client),
    configuration,
  );
  const taxes = new SalesInvoiceLineVatAdapter(productTaxation, serviceTaxation, {
    actorUserId: userId(input.actorId),
    organizationId: organizationId(input.organizationId),
    companyId: scope.companyId,
  });
  const documents = new SupabaseFiscalDocumentRepository(readers.client);
  const prepareConfirmedServiceInvoice = new PrepareConfirmedServiceInvoiceFiscalDocument(
      readers.invoices,
      readers.issuers,
      taxes,
      documents,
    );
  const candidates: FiscalDraftCandidateBuilder = {
    reconstruct: ({ sourceId, ...candidateInput }) => prepareConfirmedServiceInvoice.reconstructCandidate({
      ...candidateInput, invoiceId: sourceId,
    }),
  };
  return {
    scope,
    prepareConfirmedServiceInvoice,
    reviseFiscalDocument: new ReviseFiscalDocument(documents, candidates),
  };
}
