import { definePresentationRegistry, type PresentationRegistry } from "@kontave/client-contracts";
import type { KontaveClientFeatures } from "@kontave/client-runtime";

/** Web's explicit portable-feature classification; no treasury route is activated here. */
export const webPresentationRegistry = definePresentationRegistry<KontaveClientFeatures>({
  authentication: { status: "planned", reason: "Web has no portable authentication feature integration." },
  billing: { status: "planned", reason: "Web has no portable billing feature integration." },
  inventory: { status: "planned", reason: "Web has no portable inventory feature integration." },
  operationContext: { status: "planned", reason: "Web has no portable operation-context feature integration." },
  organizations: { status: "planned", reason: "Web has no portable organizations feature integration." },
  portalMonitoring: { status: "planned", reason: "Web has no portable portal-monitoring feature integration." },
  products: { status: "planned", reason: "Web has no portable products feature integration." },
  profile: { status: "planned", reason: "Web has no portable profile feature integration." },
  purchasing: { status: "planned", reason: "Web has no portable purchasing feature integration." },
  sales: { status: "planned", reason: "Web has no portable sales feature integration." },
  treasury: { status: "planned", reason: "Treasury presentation has not been activated." },
}) satisfies PresentationRegistry<KontaveClientFeatures>;
