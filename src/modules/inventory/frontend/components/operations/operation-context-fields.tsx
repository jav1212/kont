"use client";

// OperationContextFields — renders the operation-specific extra fields
// (motivo / referencia / destino / notas) declared in the config.

import { BaseInput } from "@/src/shared/frontend/components/base-input";
import type { ContextField, ContextFieldKind } from "./operation-types";

interface Props {
    fields: ContextField[];
    values: Record<ContextFieldKind, string>;
    onChange: (kind: ContextFieldKind, value: string) => void;
}

export function OperationContextFields({ fields, values, onChange }: Props) {
    return (
        <>
            {fields.map((field) => (
                <div key={field.kind} className={field.fullWidth ? "col-span-2" : undefined}>
                    <BaseInput.Field
                        label={field.label}
                        type="text"
                        value={values[field.kind]}
                        onValueChange={(v) => onChange(field.kind, v)}
                        placeholder={field.placeholder}
                    />
                </div>
            ))}
        </>
    );
}
