/** Supported control sizes shared by renderer adapters. */
export type UiSize = "sm" | "md" | "lg";

/** Semantic visual intentions shared by renderer adapters. */
export type UiIntent = "primary" | "neutral" | "success" | "warning" | "danger" | "info";

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
