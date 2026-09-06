import type { ComponentPropsWithoutRef } from "react";

function classNames(...values: ReadonlyArray<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export type PortalStatusAvailability = "operational" | "degraded" | "down" | "unknown";

export interface PortalStatusIndicatorProps extends ComponentPropsWithoutRef<"span"> {
  readonly status: PortalStatusAvailability;
}

/**
 * Renders the current portal availability as a decorative status dot.
 * @param props - Availability state and standard span properties.
 * @returns A status-indicator span.
 */
export function PortalStatusIndicator({ className, status, ...props }: PortalStatusIndicatorProps) {
  return <span
    {...props}
    className={classNames("kt-portal-status-indicator", className)}
    data-status={status}
  />;
}
