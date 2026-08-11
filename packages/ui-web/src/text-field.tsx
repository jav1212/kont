import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { classNames } from "./internal/class-names.js";

export interface TextFieldProps extends Omit<ComponentPropsWithoutRef<"input">, "size"> {
  readonly label: string;
  readonly error?: string;
  readonly hint?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { className, error, hint, id: providedId, label, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const messageId = error || hint ? `${id}-message` : undefined;
  return <div className={classNames("kt-field", className)}>
    <label className="kt-field__label" htmlFor={id}>{label}</label>
    <input {...props} ref={ref} id={id} aria-invalid={error ? true : undefined} aria-describedby={messageId} className="kt-field__control" />
    {error ? <span id={messageId} role="alert" className="kt-field__error">{error}</span> : hint ? <span id={messageId} className="kt-field__hint">{hint}</span> : null}
  </div>;
});
