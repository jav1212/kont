import {
  AuthorizationDenied,
  permissionCode,
} from "@kontave/access-control/domain";
import {
  companyId,
  organizationId,
  userId,
} from "@kontave/organizations/domain";
import {
  type ExchangeRateSetDto,
  type OperationalDefaultsDto,
  type UpdateOperationalDefaultsDto,
} from "@kontave/client-contracts";
import { currency } from "@kontave/monetary/domain";
import type { OperationContextCoordinator } from "@kontave/operation-context/application";
import {
  localDate,
  OperationContextFailure,
} from "@kontave/operation-context/domain";
import {
  createNativeExchangeRateResolver,
  createNativeOperationContextCoordinator,
} from "@/src/client-api/v1/operation-context/operation-context-actions";
import { toOperationalDefaultsDto } from "@/src/client-api/v1/operation-context/operation-context-mapper";
import { createOrganizationActions } from "@/src/client-api/v1/organizations/organization-actions";
import { createWebOrganizationActions } from "@/src/modules/organizations/backend/web-organization-actions";
import {
  TenantForbiddenError,
  type TenantContext,
} from "@/src/shared/backend/utils/require-tenant";

const operationalPermissions = [
  permissionCode("inventory.read"),
  permissionCode("sales.read"),
  permissionCode("purchases.read"),
] as const;

type ScopedOperationContext = {
  readonly userId: string;
  readonly organizationId: string;
  readonly companyId: string;
};

type OperationContextCoordinatorPort = Pick<
  OperationContextCoordinator,
  "getState" | "initialize" | "update"
>;

/** Narrow injectable dependencies used to test authorization ordering without a database. */
export interface WebOperationContextDependencies {
  /** Web organization boundary that validates the selected tenant and canonical permission. */
  readonly organizations?: Pick<
    ReturnType<typeof createWebOrganizationActions>,
    "workspace"
  >;
  /** Organization factory that verifies a company belongs to its route organization. */
  readonly organizationDirectory?: Pick<
    ReturnType<typeof createOrganizationActions>,
    "getCompany"
  >;
  /** Factory for the operational-default coordinator. */
  readonly createCoordinator?: () => OperationContextCoordinatorPort;
  /** Factory for the official-rate resolver. */
  readonly createExchangeRateResolver?: typeof createNativeExchangeRateResolver;
}

/**
 * Composes cookie-authenticated Web authorization with the portable operation-context coordinator.
 *
 * @param request - Incoming request containing the selected legacy tenant header.
 * @param tenant - Cookie and barcode session already validated for this request.
 * @param dependencies - Optional narrow ports used by focused tests; production uses the shared factories.
 * @returns Operations that authorize organization, company, and business-module access before context persistence.
 * @throws Error when the shared server infrastructure is not configured.
 */
export function createWebOperationContextActions(
  request: Request,
  tenant: TenantContext,
  dependencies: WebOperationContextDependencies = {},
) {
  const organizations =
    dependencies.organizations ?? createWebOrganizationActions(request, tenant);
  const organizationDirectory =
    dependencies.organizationDirectory ?? createOrganizationActions();
  const createCoordinator =
    dependencies.createCoordinator ?? createNativeOperationContextCoordinator;
  const createExchangeRateResolver =
    dependencies.createExchangeRateResolver ?? createNativeExchangeRateResolver;

  /**
   * Validates all scopes required before the operation-context store may be read or written.
   *
   * @param targetOrganizationId - Organization requested by the URL.
   * @param targetCompanyId - Company requested by the URL.
   * @returns The server-controlled identity tuple used by operation-context persistence.
   * @throws TenantForbiddenError When the selected tenant, canonical organization, company, or business permission is not authorized.
   */
  async function scope(
    targetOrganizationId: string,
    targetCompanyId: string,
  ): Promise<ScopedOperationContext> {
    await requireOperationalPermission(targetOrganizationId);
    await organizationDirectory.getCompany.execute(
      userId(tenant.userId),
      organizationId(targetOrganizationId),
      companyId(targetCompanyId),
    );
    return {
      userId: tenant.userId,
      organizationId: targetOrganizationId,
      companyId: targetCompanyId,
    };
  }

  /**
   * Reads or creates the caller's defaults after the Web scope has been authorized.
   *
   * @param targetOrganizationId - Organization requested by the URL.
   * @param targetCompanyId - Company requested by the URL.
   * @returns The current operational-defaults transport DTO.
   * @throws TenantForbiddenError or OperationContextFailure when access or persistence cannot be completed.
   */
  async function get(
    targetOrganizationId: string,
    targetCompanyId: string,
  ): Promise<OperationalDefaultsDto> {
    const key = await scope(targetOrganizationId, targetCompanyId);
    const coordinator = createCoordinator();
    await coordinator.initialize({
      userId: userId(key.userId),
      organizationId: organizationId(key.organizationId),
      companyId: companyId(key.companyId),
    });
    return readyDefaults(coordinator);
  }

  /**
   * Applies a versioned defaults change after authorizing the complete Web scope.
   *
   * @param targetOrganizationId - Organization requested by the URL.
   * @param targetCompanyId - Company requested by the URL.
   * @param update - Strictly decoded versioned update command.
   * @returns The authoritative operational-defaults transport DTO.
   * @throws TenantForbiddenError or OperationContextFailure when access, validation, concurrency, or persistence fails.
   */
  async function update(
    targetOrganizationId: string,
    targetCompanyId: string,
    update: UpdateOperationalDefaultsDto,
  ): Promise<OperationalDefaultsDto> {
    const key = await scope(targetOrganizationId, targetCompanyId);
    const coordinator = createCoordinator();
    await coordinator.initialize({
      userId: userId(key.userId),
      organizationId: organizationId(key.organizationId),
      companyId: companyId(key.companyId),
    });
    const current = readyDefaults(coordinator);
    if (current.version !== update.expectedVersion) {
      throw new OperationContextFailure(
        "OPERATION_CONTEXT_VERSION_CONFLICT",
        "El contexto operativo cambió en otro cliente.",
      );
    }
    if (
      update.presentationCurrency &&
      update.presentationCurrency !== "VES" &&
      !update.manualExchangeRate
    ) {
      throw new OperationContextFailure(
        "OPERATION_CONTEXT_INVALID",
        "Las tasas oficiales BCV deben expresarse en VES.",
      );
    }
    await coordinator.update({
      effectiveDate: update.effectiveDate
        ? localDate(update.effectiveDate)
        : undefined,
      presentationCurrency: update.presentationCurrency
        ? currency(update.presentationCurrency, 2)
        : undefined,
      manualExchangeRate: update.manualExchangeRate
        ? {
            baseCurrency: currency(update.manualExchangeRate.baseCurrency, 2),
            value: update.manualExchangeRate.value,
            reason: update.manualExchangeRate.reason,
          }
        : undefined,
    });
    return readyDefaults(coordinator);
  }

  /**
   * Resolves official rates after validating the selected organization, company, and module access.
   *
   * @param targetOrganizationId - Organization requested by the URL.
   * @param targetCompanyId - Company requested by the URL.
   * @param date - Validated local date for the requested official rate set.
   * @returns The existing exchange-rate transport DTO.
   * @throws TenantForbiddenError or OperationContextFailure when access or rate resolution fails.
   */
  async function exchangeRates(
    targetOrganizationId: string,
    targetCompanyId: string,
    date: string,
  ): Promise<ExchangeRateSetDto> {
    await scope(targetOrganizationId, targetCompanyId);
    const requestedDate = localDate(date);
    const set = await createExchangeRateResolver().historical(
      currency("VES", 2),
      requestedDate,
    );
    return {
      requestedDate: set.requestedDate,
      effectiveDate: set.effectiveDate,
      resolution: set.resolution,
      observedAt: set.observedAt,
      rates: set.rates.map((snapshot) => ({
        baseCurrency: snapshot.rate.baseCurrency.code,
        quoteCurrency: snapshot.rate.quoteCurrency.code,
        value: snapshot.rate.value,
        effectiveDate: snapshot.effectiveDate,
        capturedAt: snapshot.capturedAt,
        source: snapshot.source,
      })),
    };
  }

  /**
   * Requires at least one business capability whose operations rely on the shared context.
   *
   * @param targetOrganizationId - Organization requested by the URL.
   * @returns Nothing when one operational module is available.
   * @throws TenantForbiddenError When no operational module is authorized for the selected tenant and organization.
   */
  async function requireOperationalPermission(
    targetOrganizationId: string,
  ): Promise<void> {
    for (const permission of operationalPermissions) {
      try {
        await organizations.workspace(targetOrganizationId, permission);
        return;
      } catch (cause) {
        if (!(cause instanceof AuthorizationDenied)) throw cause;
      }
    }
    throw new TenantForbiddenError();
  }

  return { get, update, exchangeRates };
}

/**
 * Extracts a terminal snapshot from a coordinator after an awaited operation.
 *
 * @param coordinator - Coordinator that has completed initialization or update.
 * @returns A serializable operational-defaults DTO.
 * @throws OperationContextFailure When the coordinator failed or did not reach ready state.
 */
function readyDefaults(
  coordinator: Pick<OperationContextCoordinator, "getState">,
): OperationalDefaultsDto {
  const state = coordinator.getState();
  if (state.status === "ready") return toOperationalDefaultsDto(state.value);
  if (state.status === "failed") throw state.failure;
  throw new Error("Operation context did not reach a terminal ready state.");
}
