import type { Decoder } from "./decoding";

/** A transport-boundary predicate that proves one JSON value's contract shape. */
export type ResponseField<T> = (value: unknown) => value is T;

/** Validates a string without imposing a format. @param value - Candidate field. @returns Whether the field is a string. */
export const textField: ResponseField<string> = (value): value is string =>
  typeof value === "string";

/** Validates a finite JSON number. @param value - Candidate field. @returns Whether the field is a finite number. */
export const numberField: ResponseField<number> = (value): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Validates a boolean without coercion. @param value - Candidate field. @returns Whether the field is a boolean. */
export const booleanField: ResponseField<boolean> = (value): value is boolean =>
  typeof value === "boolean";

/**
 * Validates all declared object fields while accepting additive server fields.
 * @param fields - Exhaustive validators for the response contract's properties.
 * @returns A predicate that validates the complete object shape.
 */
export function shape<T extends object>(fields: {
  readonly [K in keyof T]-?: ResponseField<T[K]>;
}): ResponseField<T> {
  return (value): value is T => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return false;
    // Record access is safe only after the object check; every field is validated below.
    const candidate = value as Record<string, unknown>;
    return Object.entries<ResponseField<unknown>>(fields).every(
      ([key, validate]) =>
        Object.hasOwn(candidate, key) && validate(candidate[key]),
    );
  };
}

/**
 * Validates every member of an array, including rejecting sparse arrays.
 * @param member - Validator for each member.
 * @returns A predicate for a readonly response array.
 */
export function list<T>(member: ResponseField<T>): ResponseField<readonly T[]> {
  return (value): value is readonly T[] => {
    if (!Array.isArray(value)) return false;
    for (const item of value) if (!member(item)) return false;
    return true;
  };
}

/**
 * Accepts explicit null or one validated field value; missing fields remain invalid.
 * @param field - Non-null field validator.
 * @returns A predicate for a nullable field.
 */
export function nullOr<T>(field: ResponseField<T>): ResponseField<T | null> {
  return (value): value is T | null => value === null || field(value);
}

/**
 * Validates an exact string literal union defined by the response contract.
 * @param values - Permitted literal values.
 * @returns A predicate accepting only the listed values.
 */
export function literal<const T extends readonly string[]>(
  ...values: T
): ResponseField<T[number]> {
  return (value): value is T[number] =>
    typeof value === "string" && (values as readonly string[]).includes(value);
}

/**
 * Validates either complete branch of a response union.
 * @param first - First branch validator.
 * @param second - Second branch validator.
 * @returns A predicate for either branch.
 */
export function either<T, U>(
  first: ResponseField<T>,
  second: ResponseField<U>,
): ResponseField<T | U> {
  return (value): value is T | U => first(value) || second(value);
}

/**
 * Adapts a complete response predicate to the feature decoding boundary.
 * @param validate - Predicate proving the response DTO shape.
 * @returns The original valid DTO, preserving exact serialized amounts and extra fields.
 */
export function responseDto<T>(validate: ResponseField<T>): Decoder<T> {
  return (value) => (validate(value) ? value : null);
}
