import { forwardRef, useId, type ComponentPropsWithoutRef } from "react";
import type { FieldLoadingState } from "@kontave/ui-contracts";
import { classNames } from "./internal/class-names";
import { Skeleton } from "./skeleton";

export interface CheckboxProps extends Omit<ComponentPropsWithoutRef<"input">, "type">, FieldLoadingState {
  readonly label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, id: providedId, label, loading = false, loadingLabel = false, ...props },
  ref,
) {
  if (loading) return <span className={classNames("kt-checkbox", "kt-checkbox--loading", className)} role="status" aria-busy="true" aria-label={`Cargando ${label}`}>
    <Skeleton variant="rectangle" width={18} height={18} />
    {loadingLabel ? <Skeleton variant="text" width={112} height={14} /> : <span className="kt-checkbox__label">{label}</span>}
  </span>;
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
