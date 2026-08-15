import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "../auth/auth-context";

export default function RootLayout(): React.JSX.Element {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}
