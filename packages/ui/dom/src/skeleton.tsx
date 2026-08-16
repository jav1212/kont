import type { CSSProperties, HTMLAttributes } from "react";
import type { SkeletonContract } from "@kontave/ui-contracts";
import { classNames } from "./internal/class-names.js";

export interface SkeletonProps extends SkeletonContract, Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  readonly decorative?: boolean;
}

export function Skeleton({
  className,
  decorative = true,
  height,
  style,
  variant = "rectangle",
  width,
  ...props
}: SkeletonProps) {
  const dimensions: CSSProperties = {
    height: height === undefined ? undefined : `${height}px`,
    width: typeof width === "number" ? `${width}px` : width,
    ...style,
  };
  return <span
    {...props}
    aria-hidden={decorative || undefined}
    aria-label={decorative ? undefined : props["aria-label"] ?? "Cargando"}
    role={decorative ? undefined : "status"}
    className={classNames("kt-skeleton", `kt-skeleton--${variant}`, className)}
    style={dimensions}
  />;
}

export interface FieldSkeletonProps {
  readonly hint?: boolean;
  readonly label?: string;
  readonly loadingLabel?: boolean;
}

export function FieldSkeleton({ hint = false, label, loadingLabel = false }: FieldSkeletonProps) {
  return <div className="kt-field kt-field--loading" aria-busy="true" aria-label={label ? `Cargando ${label}` : "Cargando campo"} role="status">
    <div className="kt-field__header">
      {loadingLabel ? <Skeleton variant="text" width="36%" height={14} /> : label ? <span className="kt-field__label">{label}</span> : <Skeleton variant="text" width="36%" height={14} />}
    </div>
    <Skeleton variant="control" width="100%" />
    {hint ? <Skeleton variant="text" width="58%" height={12} /> : null}
  </div>;
}
