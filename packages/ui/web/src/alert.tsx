import type { ComponentPropsWithoutRef } from "react";
import type { UiIntent } from "@kontave/ui-contracts";
import { classNames } from "./internal/class-names.js";

export interface AlertProps extends ComponentPropsWithoutRef<"div"> {
  readonly intent?: Extract<UiIntent, "info" | "success" | "warning" | "danger">;
}

export function Alert({ className, intent = "info", ...props }: AlertProps) {
  return <div {...props} role={intent === "danger" ? "alert" : "status"} className={classNames("kt-alert", `kt-alert--${intent}`, className)} />;
}
