import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { UiProvider } from "@kontave/ui";
import { AuthProvider } from "../auth/auth-context";
import { MobileClientExperienceProvider } from "../client-experience/mobile-client-experience";

export default function RootLayout(): React.JSX.Element {
  return (
    <UiProvider theme="light">
      <AuthProvider>
        <MobileClientExperienceProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="dark" />
        </MobileClientExperienceProvider>
      </AuthProvider>
    </UiProvider>
  );
}
