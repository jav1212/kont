import { DESKTOP_IPC } from "../../renderer-bridge";
import {
  decodeChangePassword,
  decodeClientIdentifier,
  decodeCreateInventoryOperation,
  decodeCreateProduct,
  decodeCreateProductCategory,
  decodeInventoryDashboardQuery,
  decodeInventoryFlowQuery,
  decodeProductCategoryOverviewQuery,
  decodeProductListQuery,
  decodeProductMovementQuery,
  decodeProductUnitEconomicsQuery,
  decodePurchasingDashboardQuery,
  decodeReverseInventoryOperation,
  decodeSalesDashboardQuery,
  decodeUpdateCurrentUser,
  decodeUpdateInventoryOperation,
  decodeUpdateOrganization,
  decodeUpdateProduct,
  decodeUpdateProductCategory,
  decodeUpdateProductInventoryProfile,
  decodeUpdateProductSalePricing,
  decodeUpdateProductTaxation,
  decodeUpdateUserPreferences,
} from "@kontave/client-contracts";

/** Stable validation failure that the IPC boundary converts into a safe result. */
export class DesktopIpcValidationFailure extends Error {
  /**
   * Creates a failure that deliberately contains no renderer-provided detail.
   * @returns A stable validation error for the secure registrar.
   */
  constructor() {
    super("Solicitud de Desktop inválida.");
  }
}

/**
 * Validates and normalizes untrusted IPC arguments before a privileged handler runs.
 * @param channel - Static Desktop channel selected by preload.
 * @param arguments_ - Serializable values supplied by the untrusted renderer.
 * @returns The validated argument tuple in the handler's expected Desktop shape.
 * @throws {DesktopIpcValidationFailure} When channel arity or its input contract is invalid.
 */
export function validateDesktopIpcInvocation(
  channel: string,
  arguments_: readonly unknown[],
): readonly unknown[] {
  try {
    assertArity(channel, arguments_);
    if (isAuthenticationCommand(channel))
      return validateAuthentication(channel, arguments_);
    if (isSettingsMutation(channel)) {
      return normalizedSettings(channel, arguments_, validateSettings(channel, arguments_));
    }
    if (isProductMutation(channel)) {
      return normalizedMutation(channel, arguments_, validateProductMutation(channel, arguments_));
    }
    if (isInventoryMutation(channel)) {
      return normalizedMutation(channel, arguments_, validateInventoryMutation(channel, arguments_));
    }
    if (isQuery(channel)) return normalizedQuery(channel, arguments_, validateQuery(channel, arguments_));
    return arguments_;
  } catch (cause: unknown) {
    if (cause instanceof DesktopIpcValidationFailure) throw cause;
    invalid();
  }
}

function validateAuthentication(
  channel: string,
  args: readonly unknown[],
): readonly unknown[] {
  if (
    channel === DESKTOP_IPC.signIn ||
    channel === DESKTOP_IPC.register
  ) {
    const command = strictRecord(args[0], ["email", "password"]);
    return [
      Object.freeze({
        email: boundedText(command.email, 254, true),
        password: boundedText(command.password, 1_024, false),
      }),
    ];
  }
  if (
    channel === DESKTOP_IPC.verifyRegistration ||
    channel === DESKTOP_IPC.verifyPasswordRecovery
  ) {
    const command = strictRecord(args[0], ["email", "code"]);
    return [
      Object.freeze({
        email: boundedText(command.email, 254, true),
        code: boundedText(command.code, 64, true),
      }),
    ];
  }
  if (
    channel === DESKTOP_IPC.resendRegistration ||
    channel === DESKTOP_IPC.requestPasswordRecovery
  ) {
    const command = strictRecord(args[0], ["email"]);
    return [
      Object.freeze({ email: boundedText(command.email, 254, true) }),
    ];
  }
  const command = strictRecord(args[0], ["password"]);
  return [
    Object.freeze({ password: boundedText(command.password, 1_024, false) }),
  ];
}

function validateSettings(channel: string, args: readonly unknown[]): unknown {
  if (channel === DESKTOP_IPC.changeSettingsPassword) {
    return decodeChangePassword({
      newPassword: args[0],
      revokeOtherSessions: args[1],
    });
  }
  if (channel === DESKTOP_IPC.revokeOtherSettingsSessions) {
    if (args.length !== 0) invalid();
    return;
  }
  if (channel === DESKTOP_IPC.revokeSettingsSession) return segment(args[0]);
  if (channel === DESKTOP_IPC.updateSettingsOrganization) {
    segment(args[0]);
    return decodeUpdateOrganization(args[1]);
  }
  if (channel === DESKTOP_IPC.updateSettingsProfile) return decodeUpdateCurrentUser(args[0]);
  if (channel === DESKTOP_IPC.updateSettingsPreferences) return decodeUpdateUserPreferences(args[0]);
  command(args[0]);
}

function validateProductMutation(channel: string, args: readonly unknown[]): unknown {
  segment(args[0]);
  segment(args[1]);
  if (channel === DESKTOP_IPC.createProduct) return decodeCreateProduct(args[2]);
  if (channel === DESKTOP_IPC.createProductCategory) return decodeCreateProductCategory(args[2]);
  segment(args[2]);
  if (channel === DESKTOP_IPC.setProductStatus || channel === DESKTOP_IPC.setProductCategoryStatus) {
    if (typeof args[3] !== "boolean") invalid();
    return version(args[4]);
  }
  if (channel === DESKTOP_IPC.updateProduct) return decodeUpdateProduct(args[3]);
  if (channel === DESKTOP_IPC.updateProductInventoryProfile) return decodeUpdateProductInventoryProfile(args[3]);
  if (channel === DESKTOP_IPC.updateProductSalePricing) return decodeUpdateProductSalePricing(args[3]);
  if (channel === DESKTOP_IPC.updateProductTaxation) return decodeUpdateProductTaxation(args[3]);
  return decodeUpdateProductCategory(args[3]);
}

function validateInventoryMutation(channel: string, args: readonly unknown[]): unknown {
  segment(args[0]);
  segment(args[1]);
  if (channel === DESKTOP_IPC.createInventoryOperation) return decodeCreateInventoryOperation(args[2]);
  segment(args[2]);
  if (channel === DESKTOP_IPC.postInventoryOperation) return version(args[3]);
  if (channel === DESKTOP_IPC.updateInventoryOperation) return decodeUpdateInventoryOperation(args[3]);
  return decodeReverseInventoryOperation(args[3]);
}

function validateQuery(channel: string, args: readonly unknown[]): unknown {
  if (channel === DESKTOP_IPC.getSettingsSnapshot) {
    return [nullableIdentifier(args[0]), nullableIdentifier(args[1])];
  }
  if (channel === DESKTOP_IPC.listInventoryEntries || channel === DESKTOP_IPC.listInventoryOutputs || channel === DESKTOP_IPC.listInventoryOperations) return decodeInventoryFlowQuery(args[2]);
  if (channel === DESKTOP_IPC.getInventoryDashboard) return optionalDashboard(args[2], decodeInventoryDashboardQuery);
  if (channel === DESKTOP_IPC.getPurchasingDashboard) return optionalDashboard(args[2], decodePurchasingDashboardQuery);
  if (channel === DESKTOP_IPC.getSalesDashboard) return optionalDashboard(args[2], decodeSalesDashboardQuery);
  if (channel === DESKTOP_IPC.getSalesPerformanceReport) return decodeSalesPerformanceReportQuery(args[2]);
  if (channel === DESKTOP_IPC.listProducts) {
    segment(args[0]); segment(args[1]); return decodeProductListQuery(args[2]);
  }
  if (channel === DESKTOP_IPC.getProductPermissions) return segment(args[0]);
  if (channel === DESKTOP_IPC.getProduct || channel === DESKTOP_IPC.getProductCategory || channel === DESKTOP_IPC.getInventoryOperation) {
    segment(args[0]); segment(args[1]); return segment(args[2]);
  }
  if (channel === DESKTOP_IPC.listProductMovements) {
    segment(args[0]); segment(args[1]); segment(args[2]); return decodeProductMovementQuery(args[3]);
  }
  if (channel === DESKTOP_IPC.listProductCategoryOverview) {
    segment(args[0]); segment(args[1]); return decodeProductCategoryOverviewQuery(args[2]);
  }
  if (channel === DESKTOP_IPC.getProductUnitEconomics) {
    segment(args[0]); segment(args[1]); segment(args[2]); return decodeProductUnitEconomicsQuery(args[3]);
  }
  if (channel === DESKTOP_IPC.listProductCategories) { segment(args[0]); segment(args[1]); if (args[2] !== "active" && args[2] !== "inactive" && args[2] !== "all") invalid(); }
  if (channel === DESKTOP_IPC.selectWorkspace || channel === DESKTOP_IPC.selectWorkspaceModule || channel === DESKTOP_IPC.selectWorkspaceCompany || channel === DESKTOP_IPC.openExternalDestination) segment(args[0]);
}

function optionalDashboard(
  value: unknown,
  decode: (input: unknown) => unknown,
): unknown {
  if (value === undefined) return;
  if (!isPlainRecord(value)) invalid();
  if (!Object.keys(value).every((key) => key === "from" || key === "to" || key === "recentLimit" || key === "granularity")) invalid();
  const desktop = value as {
    readonly from?: unknown;
    readonly to?: unknown;
    readonly recentLimit?: unknown;
    readonly granularity?: unknown;
  };
  if (desktop.from === undefined && desktop.to === undefined) {
    if (desktop.granularity !== undefined && desktop.granularity !== "day") invalid();
    if (
      desktop.recentLimit !== undefined &&
      (!Number.isSafeInteger(desktop.recentLimit) ||
        Number(desktop.recentLimit) < 1 ||
        Number(desktop.recentLimit) > 100)
    ) invalid();
    return {
      ...(desktop.recentLimit === undefined ? {} : { recentLimit: Number(desktop.recentLimit) }),
      ...(desktop.granularity === undefined ? {} : { granularity: "day" as const }),
    };
  }
  const decoded = decode({
    from: desktop.from,
    to: desktop.to,
    granularity: desktop.granularity,
    limit: desktop.recentLimit,
  }) as {
    readonly from: string;
    readonly to: string;
    readonly limit?: number;
    readonly granularity?: "day";
  };
  return {
    from: decoded.from,
    to: decoded.to,
    ...(decoded.limit === undefined ? {} : { recentLimit: decoded.limit }),
    ...(decoded.granularity === undefined ? {} : { granularity: decoded.granularity }),
  };
}

function normalizedSettings(channel: string, args: readonly unknown[], value: unknown): readonly unknown[] {
  if (channel === DESKTOP_IPC.changeSettingsPassword) {
    const command = value as { readonly newPassword: string; readonly revokeOtherSessions: boolean };
    return [command.newPassword, command.revokeOtherSessions];
  }
  if (channel === DESKTOP_IPC.updateSettingsOrganization) return [decodeClientIdentifier(args[0]), value];
  if (channel === DESKTOP_IPC.revokeSettingsSession) return [decodeClientIdentifier(args[0])];
  return channel === DESKTOP_IPC.revokeOtherSettingsSessions ? [] : [value];
}
function normalizedMutation(_channel: string, args: readonly unknown[], value: unknown): readonly unknown[] {
  const scope = [decodeClientIdentifier(args[0]), decodeClientIdentifier(args[1])];
  if (args.length === 3) return [...scope, value];
  if (args.length === 4) return [...scope, decodeClientIdentifier(args[2]), value];
  return [...scope, decodeClientIdentifier(args[2]), args[3], value];
}
function normalizedQuery(channel: string, args: readonly unknown[], value: unknown): readonly unknown[] {
  if (channel === DESKTOP_IPC.getSettingsSnapshot)
    return value as readonly unknown[];
  if (channel === DESKTOP_IPC.getInventoryDashboard || channel === DESKTOP_IPC.getPurchasingDashboard || channel === DESKTOP_IPC.getSalesDashboard || channel === DESKTOP_IPC.getSalesPerformanceReport) return [decodeClientIdentifier(args[0]), decodeClientIdentifier(args[1]), value];
  if (channel === DESKTOP_IPC.listInventoryEntries || channel === DESKTOP_IPC.listInventoryOutputs || channel === DESKTOP_IPC.listInventoryOperations || channel === DESKTOP_IPC.listProducts || channel === DESKTOP_IPC.listProductCategoryOverview) return [decodeClientIdentifier(args[0]), decodeClientIdentifier(args[1]), value];
  if (channel === DESKTOP_IPC.getProductPermissions || channel === DESKTOP_IPC.selectWorkspace || channel === DESKTOP_IPC.selectWorkspaceModule || channel === DESKTOP_IPC.selectWorkspaceCompany || channel === DESKTOP_IPC.openExternalDestination) return [decodeClientIdentifier(args[0])];
  if (args.length === 3) return [decodeClientIdentifier(args[0]), decodeClientIdentifier(args[1]), decodeClientIdentifier(args[2])];
  return [decodeClientIdentifier(args[0]), decodeClientIdentifier(args[1]), decodeClientIdentifier(args[2]), value];
}

function isSettingsMutation(channel: string): boolean {
  return channel === DESKTOP_IPC.updateSettingsProfile || channel === DESKTOP_IPC.updateSettingsPreferences || channel === DESKTOP_IPC.updateSettingsOrganization || channel === DESKTOP_IPC.changeSettingsPassword || channel === DESKTOP_IPC.revokeSettingsSession || channel === DESKTOP_IPC.revokeOtherSettingsSessions;
}
function isAuthenticationCommand(channel: string): boolean {
  return channel === DESKTOP_IPC.signIn || channel === DESKTOP_IPC.register || channel === DESKTOP_IPC.verifyRegistration || channel === DESKTOP_IPC.resendRegistration || channel === DESKTOP_IPC.requestPasswordRecovery || channel === DESKTOP_IPC.verifyPasswordRecovery || channel === DESKTOP_IPC.completePasswordRecovery;
}
function isProductMutation(channel: string): boolean {
  return channel === DESKTOP_IPC.createProduct || channel === DESKTOP_IPC.updateProduct || channel === DESKTOP_IPC.setProductStatus || channel === DESKTOP_IPC.updateProductInventoryProfile || channel === DESKTOP_IPC.createProductCategory || channel === DESKTOP_IPC.updateProductCategory || channel === DESKTOP_IPC.setProductCategoryStatus || channel === DESKTOP_IPC.updateProductSalePricing || channel === DESKTOP_IPC.updateProductTaxation;
}
function isInventoryMutation(channel: string): boolean {
  return channel === DESKTOP_IPC.createInventoryOperation || channel === DESKTOP_IPC.updateInventoryOperation || channel === DESKTOP_IPC.postInventoryOperation || channel === DESKTOP_IPC.reverseInventoryOperation;
}
function isQuery(channel: string): boolean {
  return channel === DESKTOP_IPC.getSettingsSnapshot || channel === DESKTOP_IPC.listInventoryEntries || channel === DESKTOP_IPC.listInventoryOutputs || channel === DESKTOP_IPC.listInventoryOperations || channel === DESKTOP_IPC.getInventoryDashboard || channel === DESKTOP_IPC.getPurchasingDashboard || channel === DESKTOP_IPC.getSalesDashboard || channel === DESKTOP_IPC.getSalesPerformanceReport || channel === DESKTOP_IPC.listProducts || channel === DESKTOP_IPC.getProductPermissions || channel === DESKTOP_IPC.getProduct || channel === DESKTOP_IPC.listProductMovements || channel === DESKTOP_IPC.listProductCategories || channel === DESKTOP_IPC.getProductCategory || channel === DESKTOP_IPC.listProductCategoryOverview || channel === DESKTOP_IPC.getProductUnitEconomics || channel === DESKTOP_IPC.getInventoryOperation || channel === DESKTOP_IPC.selectWorkspace || channel === DESKTOP_IPC.selectWorkspaceModule || channel === DESKTOP_IPC.selectWorkspaceCompany || channel === DESKTOP_IPC.openExternalDestination;
}

function decodeSalesPerformanceReportQuery(value: unknown): unknown {
  const query = strictRecord(value, ["from", "to", "dimension"]);
  if (typeof query.from !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(query.from)) invalid();
  if (typeof query.to !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(query.to)) invalid();
  if (query.dimension !== "user" && query.dimension !== "role" && query.dimension !== "device") invalid();
  return { from: query.from, to: query.to, dimension: query.dimension };
}
function command(value: unknown): void {
  if (!isPlainRecord(value) || JSON.stringify(value).length > 64_000) invalid();
}
function strictRecord(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!isPlainRecord(value)) invalid();
  if (Object.keys(value).some((key) => !allowed.includes(key))) invalid();
  return value;
}
function nullableIdentifier(value: unknown): string | null {
  return value === null ? null : decodeClientIdentifier(value);
}
function boundedText(
  value: unknown,
  maximumLength: number,
  trim: boolean,
): string {
  if (typeof value !== "string") invalid();
  const normalized = trim ? value.trim() : value;
  if (!normalized || normalized.length > maximumLength) invalid();
  return normalized;
}
function segment(value: unknown): void {
  if (typeof value !== "string" || !value.trim() || value.length > 200) invalid();
}
function version(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) invalid();
  return value as number;
}
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function invalid(): never { throw new DesktopIpcValidationFailure(); }

const ARITY: Readonly<Record<string, number>> = {
  [DESKTOP_IPC.signIn]: 1, [DESKTOP_IPC.register]: 1, [DESKTOP_IPC.verifyRegistration]: 1, [DESKTOP_IPC.resendRegistration]: 1, [DESKTOP_IPC.requestPasswordRecovery]: 1, [DESKTOP_IPC.verifyPasswordRecovery]: 1, [DESKTOP_IPC.completePasswordRecovery]: 1,
  [DESKTOP_IPC.selectWorkspace]: 1, [DESKTOP_IPC.selectWorkspaceModule]: 1, [DESKTOP_IPC.selectWorkspaceCompany]: 1, [DESKTOP_IPC.openExternalDestination]: 1,
  [DESKTOP_IPC.getSettingsSnapshot]: 2, [DESKTOP_IPC.updateSettingsProfile]: 1, [DESKTOP_IPC.updateSettingsPreferences]: 1, [DESKTOP_IPC.updateSettingsOrganization]: 2, [DESKTOP_IPC.changeSettingsPassword]: 2, [DESKTOP_IPC.revokeSettingsSession]: 1,
  [DESKTOP_IPC.getInventoryDashboard]: 3, [DESKTOP_IPC.getSalesDashboard]: 3, [DESKTOP_IPC.getPurchasingDashboard]: 3,
  [DESKTOP_IPC.getSalesPerformanceReport]: 3,
  [DESKTOP_IPC.listInventoryEntries]: 3, [DESKTOP_IPC.listInventoryOutputs]: 3, [DESKTOP_IPC.listInventoryOperations]: 3, [DESKTOP_IPC.getInventoryOperation]: 3, [DESKTOP_IPC.createInventoryOperation]: 3, [DESKTOP_IPC.updateInventoryOperation]: 4, [DESKTOP_IPC.postInventoryOperation]: 4, [DESKTOP_IPC.reverseInventoryOperation]: 4,
  [DESKTOP_IPC.listProducts]: 3, [DESKTOP_IPC.getProductPermissions]: 1, [DESKTOP_IPC.getProduct]: 3, [DESKTOP_IPC.createProduct]: 3, [DESKTOP_IPC.updateProduct]: 4, [DESKTOP_IPC.setProductStatus]: 5, [DESKTOP_IPC.listProductMovements]: 4, [DESKTOP_IPC.updateProductInventoryProfile]: 4, [DESKTOP_IPC.listProductCategories]: 3, [DESKTOP_IPC.createProductCategory]: 3, [DESKTOP_IPC.updateProductCategory]: 4, [DESKTOP_IPC.setProductCategoryStatus]: 5, [DESKTOP_IPC.getProductCategory]: 3, [DESKTOP_IPC.listProductCategoryOverview]: 3, [DESKTOP_IPC.getProductUnitEconomics]: 4, [DESKTOP_IPC.updateProductSalePricing]: 4, [DESKTOP_IPC.updateProductTaxation]: 4,
};
const NO_ARGUMENTS = new Set<string>(Object.values(DESKTOP_IPC).filter((channel) => !(channel in ARITY) && !channel.endsWith("-changed") && channel !== DESKTOP_IPC.deviceEvent));
function assertArity(channel: string, args: readonly unknown[]): void {
  const expected = ARITY[channel];
  if (expected !== undefined && args.length !== expected) invalid();
  if (NO_ARGUMENTS.has(channel) && args.length !== 0) invalid();
}
