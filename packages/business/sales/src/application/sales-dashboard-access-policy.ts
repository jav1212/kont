import {
  PERMISSIONS,
  permissionCode,
  type PermissionCode,
} from "@kontave/access-control/domain";

/**
 * Defines the authorization grants needed to expose sales aggregate indicators.
 * Invoice reading remains a separate capability so cashiers can work with sales
 * records without being given visibility into the organization dashboard.
 */
/** Grants that must be effective together before a dashboard is available. */
export const salesDashboardAccessRequirement: readonly PermissionCode[] = Object.freeze([
  permissionCode(PERMISSIONS.SALES_READ),
  permissionCode(PERMISSIONS.SALES_READ_DASHBOARD),
]);

/**
 * Decides whether an effective permission set permits reading the dashboard.
 * @param permissions - Permission grants effective for the actor and organization.
 * @returns `true` only when every dashboard grant is present.
 */
export function canReadSalesDashboard(permissions: readonly PermissionCode[]): boolean {
  return salesDashboardAccessRequirement.every((permission) => permissions.includes(permission));
}

/** Destinations available after resolving the actor's effective sales grants. */
export type SalesLanding = "dashboard" | "point-of-sale" | "archive" | "unavailable";

/**
 * Resolves the safe default sales experience from a complete effective grant set.
 * @param permissions - Permission grants effective for the actor and organization.
 * @returns Dashboard for analysts, point of sale for cashiers, archive for readers, or no destination.
 */
export function resolveSalesLanding(permissions: readonly PermissionCode[]): SalesLanding {
  if (canReadSalesDashboard(permissions)) return "dashboard";
  if (
    permissions.includes(permissionCode(PERMISSIONS.SALES_READ))
    && permissions.includes(permissionCode(PERMISSIONS.SALES_CREATE))
  ) return "point-of-sale";
  return permissions.includes(permissionCode(PERMISSIONS.SALES_READ)) ? "archive" : "unavailable";
}

/** Provides an object-oriented form of the sales-dashboard authorization rule. */
export class SalesDashboardAccessPolicy {
  /** Grants that must be effective together before a dashboard is available. */
  readonly requiredPermissions = salesDashboardAccessRequirement;

  /**
   * Decides whether an effective permission set permits reading the dashboard.
   * @param permissions - Permission grants effective for the actor and organization.
   * @returns `true` only when every dashboard grant is present.
   */
  permits(permissions: readonly PermissionCode[]): boolean {
    return canReadSalesDashboard(permissions);
  }
}
