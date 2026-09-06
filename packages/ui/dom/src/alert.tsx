import type { ComponentPropsWithoutRef } from "react";
import type { UiIntent } from "@kontave/ui/contracts";
import { classNames } from "./internal/class-names";

export interface AlertProps extends ComponentPropsWithoutRef<"div"> {
  readonly intent?: Extract<
    UiIntent,
    "info" | "success" | "warning" | "danger"
  >;
}

/**
 * Presents supplied feedback using the appropriate announcement urgency.
 * @param props - Message content, semantic intent and DOM attributes.
 * @returns A themed alert or status region.
 */
export function Alert({ className, intent = "info", ...props }: AlertProps) {
  return (
    <div
      {...props}
      role={intent === "danger" ? "alert" : "status"}
      className={classNames("kt-alert", `kt-alert--${intent}`, className)}
    />
  );
}
