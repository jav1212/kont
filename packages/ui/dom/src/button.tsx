import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { InteractiveState, UiIntent, UiSize } from "@kontave/ui-contracts";
import { classNames } from "./internal/class-names.js";

export type ButtonAppearance = "solid" | "text";

export interface ButtonProps extends Omit<ComponentPropsWithoutRef<"button">, "disabled">, InteractiveState {
  readonly appearance?: ButtonAppearance;
  readonly intent?: Extract<UiIntent, "primary" | "neutral" | "danger">;
  readonly size?: UiSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { appearance = "solid", children, className, disabled, intent = "primary", loading = false, size = "md", type = "button", ...props },
  ref,
) {
  return <button {...props} ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
    className={classNames("kt-button", `kt-button--${intent}`, `kt-button--${size}`, `kt-button--${appearance}`, className)}>
    {loading ? <span className="kt-spinner" aria-hidden="true" /> : null}
    <span>{children}</span>
  </button>;
});
