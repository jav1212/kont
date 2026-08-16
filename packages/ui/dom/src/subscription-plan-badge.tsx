import type { ComponentPropsWithoutRef } from "react";
import { classNames } from "./internal/class-names";

export interface SubscriptionPlanBadgeProps extends Omit<ComponentPropsWithoutRef<"span">, "children"> {
  readonly planName: string;
}

/** Portable account-plan treatment shared by native DOM clients. */
export function SubscriptionPlanBadge({ className, planName, ...props }: SubscriptionPlanBadgeProps) {
  return <span {...props} className={classNames("kt-subscription-plan-badge", className)}>
    {sentenceCase(planName)}
  </span>;
}

function sentenceCase(value: string): string {
  const normalized = value.trim().replaceAll("_", " ").replace(/\s+/g, " ").toLocaleLowerCase("es");
  return normalized ? normalized.charAt(0).toLocaleUpperCase("es") + normalized.slice(1) : value;
}
