"use client";

import { BaseInput } from "@/src/shared/frontend/components/base-input";

interface PeriodSelectorProps {
  readonly value: string;
  readonly onChange: (period: string) => void;
  readonly label?: string;
}

/** Controls the fiscal month used by IVA screens.
 * @param props - Current month, change handler, and optional accessible label.
 * @returns A month selector.
 */
export function PeriodSelector({ value, onChange, label = "Período fiscal" }: PeriodSelectorProps): React.JSX.Element {
  return <BaseInput.Field label={label} type="month" value={value} onValueChange={onChange} className="w-full sm:w-48" />;
}
