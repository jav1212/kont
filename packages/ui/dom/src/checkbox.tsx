import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import type { FieldLoadingState } from "@kontave/ui/contracts";
import { classNames } from "./internal/class-names";
import { Skeleton } from "./skeleton";

export interface CheckboxProps
  extends
    Omit<ComponentPropsWithoutRef<"input">, "type" | "checked" | "onChange">,
    FieldLoadingState {
  readonly label: string;
  /** Controlled selected state. */
  readonly checked?: boolean;
  /** Renderer-neutral controlled state update. */
  readonly onCheckedChange?: (checked: boolean) => void;
  /** DOM-specific change event for integrations that need it. */
  readonly onChange?: ComponentPropsWithoutRef<"input">["onChange"];
}

/**
 * Edits a controlled boolean with a visible label and native keyboard behavior.
 * @param props - Label, selection, loading state and controlled-change callback.
 * @param ref - Optional DOM control reference for consumer focus management.
 * @returns A labeled checkbox, or a noninteractive loading placeholder.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox(
    {
      checked,
      className,
      id: providedId,
      label,
      loading = false,
      loadingLabel = false,
      onChange,
      onCheckedChange,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    if (loading)
      return (
        <span
          className={classNames(
            "kt-checkbox",
            "kt-checkbox--loading",
            className,
          )}
          role="status"
          aria-busy="true"
          aria-label={`Cargando ${label}`}
        >
          <Skeleton variant="rectangle" width={18} height={18} />
          {loadingLabel ? (
            <Skeleton variant="text" width={112} height={14} />
          ) : (
            <span className="kt-checkbox__label">{label}</span>
          )}
        </span>
      );
    const id = providedId ?? generatedId;
    return (
      <label className={classNames("kt-checkbox", className)} htmlFor={id}>
        <input
          {...props}
          ref={ref}
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => {
            onChange?.(event);
            onCheckedChange?.(event.currentTarget.checked);
          }}
        />
        <span className="kt-checkbox__control" aria-hidden="true">
          <svg viewBox="0 0 16 16">
            <path d="m3.5 8 3 3 6-6" />
          </svg>
        </span>
        <span className="kt-checkbox__label">{label}</span>
      </label>
    );
  },
);
