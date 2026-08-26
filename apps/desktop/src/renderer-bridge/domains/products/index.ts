import type { ClientResultPort, ProductsPort } from "@kontave/client-contracts";

export type {
  ProductCategoryOverviewQuery as DesktopProductCategoryOverviewQuery,
  ProductInsightsQuery as DesktopProductInsightsQuery,
  ProductListQuery as DesktopProductListQuery,
  ProductMovementQuery as DesktopProductMovementQuery,
} from "@kontave/client-contracts";

/**
 * Products operations transported through Electron.
 *
 * The functional contract remains owned by `@kontave/client-contracts`;
 * Electron only converts expected failures into structured-clone-safe results.
 */
export type DesktopProductsApi = ClientResultPort<ProductsPort>;

/** Result of any Products operation transported through Electron. */
export type DesktopProductsResult<T> =
  import("@kontave/client-contracts").ClientOperationResult<T>;
