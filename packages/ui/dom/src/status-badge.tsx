import type { ComponentPropsWithoutRef } from "react";
import type { UiIntent } from "@kontave/ui/contracts";
import { classNames } from "./internal/class-names";

export interface StatusBadgeProps extends ComponentPropsWithoutRef<"span"> {
  readonly intent?: Extract<
    UiIntent,
    "neutral" | "info" | "success" | "warning" | "danger"
  >;
}

/**
 * Presents a supplied status label without interpreting domain state.
 * @param props - Label content, semantic intent and DOM attributes.
 * @returns A compact themed status badge.
 */
export function StatusBadge({
  className,
  intent = "neutral",
  ...props
}: StatusBadgeProps) {
  return (
    <span
      {...props}
      className={classNames("kt-badge", `kt-badge--${intent}`, className)}
    />
  );
}
