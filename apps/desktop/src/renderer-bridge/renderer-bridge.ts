import type { ClientResultPort, ProductsPort } from "@kontave/client-contracts";
import type { DesktopClientRuntimeBridge } from "./core/client-runtime";
import type { DesktopAuthenticationApi } from "./domains/authentication";
import type { DesktopBillingApi } from "./domains/billing";
import type { DesktopConnectivityApi } from "./domains/connectivity";
import type { DesktopDevicesApi } from "./domains/devices";
import type { DesktopInventoryApi } from "./domains/inventory";
import type { DesktopNavigationApi } from "./domains/navigation";
import type { DesktopPlatformStatusApi } from "./domains/platform-status";
import type { DesktopProfileApi } from "./domains/profile";
import type { DesktopPurchasingApi } from "./domains/purchasing";
import type { DesktopSalesApi } from "./domains/sales";
import type { DesktopSettingsApi } from "./domains/settings";
import type { DesktopUpdatesApi } from "./domains/updates";
import type { DesktopWorkspaceApi } from "./domains/workspace";

/** Narrow capability facade exposed by preload to the sandboxed renderer. */
export interface KontaveRendererBridge {
  readonly client: DesktopClientRuntimeBridge;
  readonly auth: DesktopAuthenticationApi;
  readonly devices: DesktopDevicesApi;
  readonly updates: DesktopUpdatesApi;
  readonly workspace: DesktopWorkspaceApi;
  readonly profile: DesktopProfileApi;
  readonly billing: DesktopBillingApi;
  readonly platformStatus: DesktopPlatformStatusApi;
  readonly navigation: DesktopNavigationApi;
  readonly connectivity: DesktopConnectivityApi;
  readonly settings: DesktopSettingsApi;
  readonly inventory: DesktopInventoryApi;
  readonly sales: DesktopSalesApi;
  readonly purchasing: DesktopPurchasingApi;
  readonly products: ClientResultPort<ProductsPort>;
}
