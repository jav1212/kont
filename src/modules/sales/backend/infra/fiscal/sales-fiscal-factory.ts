import { companyId } from "@kontave/companies/domain";
import { SupabaseFiscalDocumentRepository } from "@kontave/fiscal/supabase";
import { ReviseFiscalDocument, type FiscalDraftCandidateBuilder } from "@kontave/fiscal/application";
import { fiscalDate, fiscalTaxDetermination } from "@kontave/fiscal/domain";
import { toFiscalTaxDeterminations } from "@kontave/taxation/fiscal";
import { GetResolvedServiceTaxation } from "@kontave/taxation/application";
import { SupabaseServiceTaxationRepository } from "@kontave/taxation/supabase";
import { resolveVenezuelanVat } from "@kontave/taxation/venezuela";
import { GetServiceTaxProfile, SetServiceTaxTreatment } from "@kontave/taxation/application";
import { organizationId, userId } from "@kontave/organizations/domain";
import { taxCode } from "@kontave/taxation/domain";
import type { FiscalPersistenceScope } from "@kontave/fiscal/domain";
import { createSupabaseSalesFiscalReaders } from "./confirmed-service-invoice-reader";
import {
  PrepareConfirmedServiceInvoiceFiscalDocument,
  type ConfirmedServiceInvoiceTaxResolver,
} from "@kontave/sales/application";
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
 * Builds server-owned fiscal preparation dependencies for legacy service invoices.
 * @param input - Authorized tenant, actor, organization, and company identifiers.
 * @returns Company scope and the confirmed-service fiscal preparation use case.
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
  const taxation = new SupabaseServiceTaxationRepository(readers.client);
  const resolver = new GetResolvedServiceTaxation(taxation);
  const taxes: ConfirmedServiceInvoiceTaxResolver = {
    async resolveLine(invoice, lineIndex) {
      const line = invoice.lines[lineIndex];
      if (!line?.serviceTaxCode) throw new Error("Confirmed service line has no tax classification code.");
      const resolved = await resolver.execute({
        actorUserId: userId(input.actorId),
        organizationId: organizationId(input.organizationId),
        companyId: scope.companyId,
      }, line.serviceTaxCode, taxCode("IVA"), invoice.invoiceDate);
      const decision = resolveVenezuelanVat({
        profile: resolved.profile,
        rules: [resolved.rule],
        operationDate: invoice.invoiceDate,
        lineReference: line.id,
        lineAmount: line.netAmount,
        roundingMode: "half_up",
      });
      const assignment = resolved.profile.assignmentAt(taxCode("IVA"), invoice.invoiceDate);
      return {
        unitCode: resolved.profile.unitCode,
        determinations: toFiscalTaxDeterminations([decision]).map((determination) => fiscalTaxDetermination({
          ...determination,
          operationDate: fiscalDate(invoice.invoiceDate),
          legalBasis: resolved.rule.legalBasis,
          classificationVersion: assignment.classificationVersion,
          classificationLegalBasis: assignment.legalBasis,
        })),
      };
    },
  };
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
