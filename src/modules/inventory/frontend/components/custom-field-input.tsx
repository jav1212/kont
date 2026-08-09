// Dynamic form input for sector-specific and user-defined custom fields.
// Renders the appropriate input based on CustomFieldDefinition.type.
"use client";

import { BaseInput } from "@/src/shared/frontend/components/base-input";
import { BaseSelect } from "@/src/shared/frontend/components/base-select";
import type { CustomFieldDefinition } from "@/src/modules/companies/frontend/hooks/use-companies";

interface CustomFieldInputProps {
  field: CustomFieldDefinition;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
  isReadOnly?: boolean;
}

// Renders a single custom field input based on its type definition.
export function CustomFieldInput({ field, value, onChange, isReadOnly }: CustomFieldInputProps) {
  const strValue = value != null ? String(value) : "";

  switch (field.type) {
    case "text":
      return (
        <BaseInput.Field
          label={field.label}
          value={strValue}
          onValueChange={(v) => onChange(field.key, v)}
          isRequired={field.required}
          isReadOnly={isReadOnly}
          size="sm"
        />
      );

    case "number":
      return (
        <BaseInput.Field
          label={field.label}
          type="number"
          value={strValue}
          onValueChange={(v) => onChange(field.key, v === "" ? null : Number(v))}
          isRequired={field.required}
          isReadOnly={isReadOnly}
          size="sm"
        />
      );

    case "date":
      return (
        <BaseInput.Field
          label={field.label}
          type="date"
          value={strValue}
          onValueChange={(v) => onChange(field.key, v || null)}
          isRequired={field.required}
          isReadOnly={isReadOnly}
          size="sm"
        />
      );

    case "select":
      return (
        <BaseSelect
          label={field.label}
          items={(field.options ?? []).map((option) => ({ id: option, name: option }))}
          value={strValue}
          onValueChange={(selected) => onChange(field.key, selected || null)}
          selectionMode="single"
          isRequired={field.required}
          isDisabled={isReadOnly}
          size="sm"
        />
      );

    default:
      return null;
  }
}

// Renders a group of custom fields from an array of definitions.
interface CustomFieldGroupProps {
  fields: CustomFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  isReadOnly?: boolean;
}

export function CustomFieldGroup({ fields, values, onChange, isReadOnly }: CustomFieldGroupProps) {
  if (fields.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((field) => (
        <CustomFieldInput
          key={field.key}
          field={field}
          value={values[field.key]}
          onChange={onChange}
          isReadOnly={isReadOnly}
        />
      ))}
    </div>
  );
}
