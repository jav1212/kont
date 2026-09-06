/** Supported control sizes shared by renderer adapters. */
export type UiSize = "sm" | "md" | "lg";

/** Semantic visual intentions shared by renderer adapters. */
export type UiIntent =
  "primary" | "neutral" | "success" | "warning" | "danger" | "info";

/** Portable interaction state for controls that can be unavailable or busy. */
export interface InteractiveState {
  readonly disabled?: boolean;
  readonly loading?: boolean;
}

/** Renderer-neutral skeleton shapes. */
export type SkeletonVariant = "text" | "control" | "rectangle" | "circle";

/** Portable fixed or proportional skeleton width. */
export type SkeletonWidth = number | `${number}%`;

/** Renderer-neutral loading placeholder contract. */
export interface SkeletonContract {
  readonly variant?: SkeletonVariant;
  readonly width?: SkeletonWidth;
  readonly height?: number;
}

/** Loading state shared by field adapters. */
export interface FieldLoadingState {
  readonly loading?: boolean;
  readonly loadingLabel?: boolean;
}

/** A serializable option rendered by a renderer-specific picker adapter. */
export interface OptionPickerEntry<TValue extends string = string> {
  /** Stable business value returned when this option is selected. */
  readonly value: TValue;
  /** Human-readable option name. */
  readonly label: string;
  /** Optional supporting copy. */
  readonly description?: string;
  /** Prevents the option from being selected. */
  readonly disabled?: boolean;
}

/** A calendar date encoded without a time zone. */
export type IsoDate = `${number}-${number}-${number}`;

/** A calendar month encoded without a time zone. */
export type DatePeriod = `${number}-${number}`;
