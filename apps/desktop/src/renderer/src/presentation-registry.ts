import {
  definePresentationRegistry,
  type PresentationRegistry,
} from "@kontave/client-contracts";
import type { KontaveClientFeatures } from "@kontave/client-runtime";

/** Exhaustive Desktop presentation decision for every portable client feature. */
export const desktopPresentationRegistry =
  definePresentationRegistry<KontaveClientFeatures>({
    authentication: { status: "ready" },
    billing: { status: "ready" },
    inventory: { status: "ready" },
    operationContext: { status: "ready" },
    organizations: { status: "ready" },
    platformStatus: { status: "ready" },
    products: { status: "ready" },
    profile: { status: "ready" },
    purchasing: { status: "ready" },
    sales: { status: "ready" },
  }) satisfies PresentationRegistry<KontaveClientFeatures>;
