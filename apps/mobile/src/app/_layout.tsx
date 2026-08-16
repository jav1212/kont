import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../auth/auth-context";
import { MobileClientExperienceProvider } from "../client-experience/mobile-client-experience";

export default function RootLayout(): React.JSX.Element {
  return (
    <AuthProvider>
      <MobileClientExperienceProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="dark" />
      </MobileClientExperienceProvider>
    </AuthProvider>
  );
}
