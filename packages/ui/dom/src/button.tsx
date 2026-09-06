import { forwardRef, type ComponentPropsWithoutRef } from "react";
import type { InteractiveState, UiIntent, UiSize } from "@kontave/ui/contracts";
import { classNames } from "./internal/class-names";

export type ButtonAppearance = "solid" | "outline" | "text" | "unstyled";

export interface ButtonProps
  extends
    Omit<ComponentPropsWithoutRef<"button">, "disabled" | "onClick">,
    InteractiveState {
  readonly appearance?: ButtonAppearance;
  readonly iconOnly?: boolean;
  readonly intent?: UiIntent;
  readonly size?: UiSize;
  /** Renderer-neutral press action. It runs unless the button is unavailable. */
  readonly onPress?: () => void;
  /** DOM-specific click callback retained for anchor-like desktop integrations. */
  readonly onClick?: ComponentPropsWithoutRef<"button">["onClick"];
}

/**
 * Renders an accessible action while preserving native button behavior.
 * @param props - Content, semantic appearance, action and optional DOM attributes.
 * @param ref - Optional DOM button ref for consumer focus management.
 * @returns A button that cannot activate while disabled or loading.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      appearance = "solid",
      children,
      className,
      disabled,
      iconOnly = false,
      intent = "primary",
      loading = false,
      onClick,
      onPress,
      size = "md",
      type = "button",
      ...props
    },
    ref,
  ) {
    const visualClasses =
      appearance === "unstyled"
        ? ["kt-button--unstyled"]
        : [
            `kt-button--${intent}`,
            `kt-button--${size}`,
            `kt-button--${appearance}`,
          ];

    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) onPress?.();
        }}
        className={classNames(
          "kt-button",
          ...visualClasses,
          iconOnly && "kt-button--icon-only",
          className,
        )}
      >
        {loading ? <span className="kt-spinner" aria-hidden="true" /> : null}
        {appearance === "unstyled" ? children : <span>{children}</span>}
      </button>
    );
  },
);
