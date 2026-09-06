import { Redirect } from "expo-router";
import { UiCatalogScreen } from "../presentation/ui-catalog-screen";

/**
 * Exposes the UI catalog only in development builds.
 *
 * @returns The native UI catalog during development, otherwise the application home route.
 */
export default function UiCatalogRoute(): React.JSX.Element {
  if (!__DEV__) return <Redirect href="/" />;
  return <UiCatalogScreen />;
}
