import { companyId } from "@kontave/companies/domain";
import {
  ReviseFiscalDocument,
  type FiscalDraftCandidateBuilder,
} from "@kontave/fiscal/application";
import { SupabaseFiscalDocumentRepository } from "@kontave/fiscal/supabase";
import type { FiscalPersistenceScope } from "@kontave/fiscal/domain";
import { createSupabaseServiceVenezuelanVatResolver } from "@kontave/taxation/supabase";
import { organizationId, userId } from "@kontave/organizations/domain";
import { ConfirmedServiceInvoiceVatAdapter } from "../taxation";
import { PrepareConfirmedServiceInvoiceFiscalDocument } from "../../application";
import { createSupabaseSalesFiscalReaders } from "./confirmed-service-invoice-fiscal-readers";

/** Server configuration to compose the confirmed-service fiscal flow from workspace ports. */
export interface SupabaseConfirmedServiceFiscalActionsConfiguration {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly organizationId: string;
  readonly companyId: string;
}

/**
 * Creates the server-side service fiscal preparation and revision use cases.
 * @param configuration - Server credential and authorized tenant/actor/organization/company scope.
 * @returns Scope, fiscal preparation, and revision commands backed by workspace adapters.
 * @throws When a Supabase client cannot be constructed from the supplied configuration.
 */
export function createSupabaseConfirmedServiceFiscalActions(configuration: SupabaseConfirmedServiceFiscalActionsConfiguration): {
  readonly scope: FiscalPersistenceScope;
  readonly prepareConfirmedServiceInvoice: PrepareConfirmedServiceInvoiceFiscalDocument;
  readonly reviseFiscalDocument: ReviseFiscalDocument;
} {
  const scope: FiscalPersistenceScope = {
    tenantId: configuration.tenantId,
    organizationId: configuration.organizationId,
    companyId: companyId(configuration.companyId),
  };
  const readers = createSupabaseSalesFiscalReaders(configuration);
  const taxes = new ConfirmedServiceInvoiceVatAdapter(
    createSupabaseServiceVenezuelanVatResolver(configuration),
    {
      actorUserId: userId(configuration.actorId),
      organizationId: organizationId(configuration.organizationId),
      companyId: scope.companyId,
    },
  );
  const documents = new SupabaseFiscalDocumentRepository(readers.client);
  const prepareConfirmedServiceInvoice = new PrepareConfirmedServiceInvoiceFiscalDocument(
    readers.invoices,
    readers.issuers,
    taxes,
    documents,
  );
  const candidates: FiscalDraftCandidateBuilder = {
    reconstruct: ({ sourceId, ...input }) => prepareConfirmedServiceInvoice.reconstructCandidate({
      ...input,
      invoiceId: sourceId,
    }),
  };
  return {
    scope,
    prepareConfirmedServiceInvoice,
    reviseFiscalDocument: new ReviseFiscalDocument(documents, candidates),
  };
}
