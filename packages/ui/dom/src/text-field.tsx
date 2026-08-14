import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { classNames } from "./internal/class-names.js";

export interface TextFieldProps extends Omit<ComponentPropsWithoutRef<"input">, "size"> {
  readonly label: string;
  readonly labelAction?: ReactNode;
  readonly endAdornment?: ReactNode;
  readonly error?: string;
  readonly hint?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { className, endAdornment, error, hint, id: providedId, label, labelAction, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const messageId = error || hint ? `${id}-message` : undefined;
  return <div className={classNames("kt-field", className)}>
    <div className="kt-field__header">
      <label className="kt-field__label" htmlFor={id}>{label}</label>
      {labelAction}
    </div>
    <div className="kt-field__control-wrap">
      <input {...props} ref={ref} id={id} aria-invalid={error ? true : undefined} aria-describedby={messageId}
        className={classNames("kt-field__control", Boolean(endAdornment) && "kt-field__control--adorned")} />
      {endAdornment ? <div className="kt-field__adornment">{endAdornment}</div> : null}
    </div>
    {error ? <span id={messageId} role="alert" className="kt-field__error">{error}</span> : hint ? <span id={messageId} className="kt-field__hint">{hint}</span> : null}
  </div>;
});
