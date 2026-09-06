/**
 * Joins optional CSS classes for a component without emitting empty values.
 * @param values - Class names or false/undefined values from conditional styling.
 * @returns The combined class attribute.
 */
export function classNames(
  ...values: ReadonlyArray<string | false | null | undefined>
): string {
  return values.filter(Boolean).join(" ");
}
