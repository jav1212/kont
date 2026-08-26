import type {
  AuthenticationPort,
  BillingPort,
  InventoryPort,
  OperationContextPort,
  OrganizationsPort,
  PlatformStatusPort,
  ProductsPort,
  ProfilePort,
  PurchasingPort,
  SalesPort,
} from "@kontave/client-contracts";
import { RemoteAuthenticationPort } from "../domains/authentication";
import { RemoteBillingPort } from "../domains/billing";
import { RemoteInventoryPort } from "../domains/inventory";
import { RemoteOperationContextPort } from "../domains/operation-context";
import { RemoteOrganizationsPort } from "../domains/organizations";
import { RemotePlatformStatusPort } from "../domains/platform-status";
import { RemoteProductsPort } from "../domains/products";
import { RemoteProfilePort } from "../domains/profile";
import { RemotePurchasingPort } from "../domains/purchasing";
import { RemoteSalesPort } from "../domains/sales";
import {
  KontaveRemoteClient,
  type KontaveRemoteClientConfiguration,
  type RemoteTransport,
} from "../transport";

/** Complete set of remote application ports consumed by the client runtime. */
export interface RemoteKontavePorts {
  readonly authentication: AuthenticationPort;
  readonly billing: BillingPort;
  readonly inventory: InventoryPort;
  readonly operationContext: OperationContextPort;
  readonly organizations: OrganizationsPort;
  readonly platformStatus: PlatformStatusPort;
  readonly products: ProductsPort;
  readonly profile: ProfilePort;
  readonly purchasing: PurchasingPort;
  readonly sales: SalesPort;
}

/**
 * Creates every remote port over one authenticated transport.
 * @param configuration - Shared API endpoint, platform identity, and request adapter.
 * @returns Immutable remote port composition for one Kontave client.
 */
export function createRemoteKontavePorts(
  configuration: KontaveRemoteClientConfiguration,
): RemoteKontavePorts {
  return createRemoteKontavePortsFromTransport(
    new KontaveRemoteClient(configuration),
  );
}

/**
 * Creates every remote port over an existing transport.
 * @param transport - Shared authenticated transport used by all capabilities.
 * @returns Immutable remote port composition for one Kontave client.
 */
export function createRemoteKontavePortsFromTransport(
  transport: RemoteTransport,
): RemoteKontavePorts {
  return Object.freeze({
    authentication: new RemoteAuthenticationPort(transport),
    billing: new RemoteBillingPort(transport),
    inventory: new RemoteInventoryPort(transport),
    operationContext: new RemoteOperationContextPort(transport),
    organizations: new RemoteOrganizationsPort(transport),
    platformStatus: new RemotePlatformStatusPort(transport),
    products: new RemoteProductsPort(transport),
    profile: new RemoteProfilePort(transport),
    purchasing: new RemotePurchasingPort(transport),
    sales: new RemoteSalesPort(transport),
  });
}
