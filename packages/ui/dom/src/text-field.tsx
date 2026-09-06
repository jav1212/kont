import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import type { FieldLoadingState } from "@kontave/ui/contracts";
import { classNames } from "./internal/class-names";
import { FieldSkeleton } from "./skeleton";

export interface TextFieldProps
  extends
    Omit<ComponentPropsWithoutRef<"input">, "size" | "onChange">,
    FieldLoadingState {
  readonly label: string;
  readonly labelAction?: ReactNode;
  readonly endAdornment?: ReactNode;
  readonly error?: string;
  readonly hint?: ReactNode;
  /** Renderer-neutral controlled string update. */
  readonly onValueChange?: (value: string) => void;
  /** DOM-specific change event for integrations that need it. */
  readonly onChange?: ComponentPropsWithoutRef<"input">["onChange"];
}

/**
 * Edits a string with an associated label and accessible validation feedback.
 * @param props - Label, controlled value, validation message and DOM input attributes.
 * @param ref - Optional DOM control reference for consumer focus management.
 * @returns A labeled input, or a loading placeholder with stable layout.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      className,
      endAdornment,
      error,
      hint,
      id: providedId,
      label,
      labelAction,
      loading = false,
      loadingLabel = false,
      onChange,
      onValueChange,
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    if (loading)
      return (
        <FieldSkeleton
          hint={Boolean(hint || error)}
          label={label}
          loadingLabel={loadingLabel}
        />
      );
    const id = providedId ?? generatedId;
    const messageId = error || hint ? `${id}-message` : undefined;
    return (
      <div className={classNames("kt-field", className)}>
        <div className="kt-field__header">
          <label className="kt-field__label" htmlFor={id}>
            {label}
          </label>
          {labelAction}
        </div>
        <div className="kt-field__control-wrap">
          <input
            {...props}
            ref={ref}
            id={id}
            onChange={(event) => {
              onChange?.(event);
              onValueChange?.(event.currentTarget.value);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={messageId}
            className={classNames(
              "kt-field__control",
              Boolean(endAdornment) && "kt-field__control--adorned",
            )}
          />
          {endAdornment ? (
            <div className="kt-field__adornment">{endAdornment}</div>
          ) : null}
        </div>
        {error ? (
          <span id={messageId} role="alert" className="kt-field__error">
            {error}
          </span>
        ) : hint ? (
          <span id={messageId} className="kt-field__hint">
            {hint}
          </span>
        ) : null}
      </div>
    );
  },
);
