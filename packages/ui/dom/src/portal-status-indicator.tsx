import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "./internal/class-names";

export type PortalStatusAvailability = "operational" | "degraded" | "down" | "unknown";

export interface PortalStatusIndicatorProps extends ComponentPropsWithoutRef<"span"> {
  readonly status: PortalStatusAvailability;
}

export function PortalStatusIndicator({ className, status, ...props }: PortalStatusIndicatorProps) {
  return <span
    {...props}
    className={classNames("kt-portal-status-indicator", className)}
    data-status={status}
  />;
}
