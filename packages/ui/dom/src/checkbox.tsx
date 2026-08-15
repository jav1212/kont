import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import { classNames } from "./internal/class-names.js";

export interface CheckboxProps extends Omit<ComponentPropsWithoutRef<"input">, "type"> {
  readonly label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, id: providedId, label, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return <label className={classNames("kt-checkbox", className)} htmlFor={id}>
    <input {...props} ref={ref} id={id} type="checkbox" />
    <span className="kt-checkbox__control" aria-hidden="true">
      <svg viewBox="0 0 16 16"><path d="m3.5 8 3 3 6-6" /></svg>
    </span>
    <span className="kt-checkbox__label">{label}</span>
  </label>;
});
