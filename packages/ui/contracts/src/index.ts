export type UiSize = "sm" | "md" | "lg";
export type UiIntent = "primary" | "neutral" | "success" | "warning" | "danger" | "info";
export interface InteractiveState { readonly disabled?: boolean; readonly loading?: boolean; }

export type SkeletonVariant = "text" | "control" | "rectangle" | "circle";
export type SkeletonWidth = number | `${number}%`;

/** Renderer-neutral shape. DOM and React Native own their animation and accessibility adapters. */
export interface SkeletonContract {
  readonly variant?: SkeletonVariant;
  readonly width?: SkeletonWidth;
  readonly height?: number;
}

export interface FieldLoadingState {
  readonly loading?: boolean;
  readonly loadingLabel?: boolean;
}
