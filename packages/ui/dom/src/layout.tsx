import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "./internal/class-names";

export function PageShell({ className, ...props }: ComponentPropsWithoutRef<"main">) {
  return <main {...props} className={classNames("kt-page", className)} />;
}

export function Stack({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div {...props} className={classNames("kt-stack", className)} />;
}
