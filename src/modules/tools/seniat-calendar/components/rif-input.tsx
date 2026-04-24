"use client";

import { Building2, CheckCircle2 } from "lucide-react";
import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { formatRifMask } from "../utils/rif";

interface RifInputProps {
    value: string;
    onChange: (v: string) => void;
    touched: boolean;
    valid: boolean;
}

export function RifInput({ value, onChange, touched, valid }: RifInputProps) {
    const showError = touched && value.length > 0 && !valid;
    const showValid = valid;

    const endContent = showValid ? (
        <CheckCircle2 size={15} className="text-text-success flex-shrink-0" strokeWidth={2} />
    ) : (
        <Building2 size={15} className="text-text-disabled flex-shrink-0" strokeWidth={1.5} />
    );

    function handleChange(raw: string) {
        const masked = formatRifMask(raw);
        onChange(masked);
    }

    return (
        <div className="w-full sm:w-[260px]">
            <BaseInput.Field
                aria-label="RIF de la empresa a consultar"
                aria-describedby="rif-helper"
                placeholder="J-12345678-9"
                value={value}
                onValueChange={handleChange}
                error={showError ? "RIF inválido. Formato: J-12345678-9" : undefined}
                endContent={endContent}
                className={[
                    "transition-all duration-150",
                    showValid
                        ? "[&_.group]:!border-success/60 [&_.group]:!ring-2 [&_.group]:!ring-success/10"
                        : "",
                ].join(" ")}
            />
        </div>
    );
}
