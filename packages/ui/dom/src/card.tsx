import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "./internal/class-names";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section {...props} className={classNames("kt-card", className)} />;
}
