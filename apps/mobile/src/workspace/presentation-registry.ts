import { definePresentationRegistry, type PresentationRegistry } from "@kontave/client-contracts";
import type { KontaveClientFeatures } from "@kontave/client-runtime";

/** Mobile's explicit portable-feature classification; no treasury screen is activated here. */
export const mobilePresentationRegistry = definePresentationRegistry<KontaveClientFeatures>({
  authentication: { status: "planned", reason: "Mobile has no portable authentication feature integration." },
  billing: { status: "planned", reason: "Mobile has no portable billing feature integration." },
  inventory: { status: "planned", reason: "Mobile has no portable inventory feature integration." },
  operationContext: { status: "planned", reason: "Mobile has no portable operation-context feature integration." },
  organizations: { status: "planned", reason: "Mobile has no portable organizations feature integration." },
  payables: { status: "planned", reason: "Accounts Payable presentation has not been activated." },
  portalMonitoring: { status: "planned", reason: "Mobile has no portable portal-monitoring feature integration." },
  products: { status: "planned", reason: "Mobile has no portable products feature integration." },
  profile: { status: "planned", reason: "Mobile has no portable profile feature integration." },
  purchasing: { status: "planned", reason: "Mobile has no portable purchasing feature integration." },
  sales: { status: "planned", reason: "Mobile has no portable sales feature integration." },
  treasury: { status: "planned", reason: "Treasury presentation has not been activated." },
}) satisfies PresentationRegistry<KontaveClientFeatures>;
