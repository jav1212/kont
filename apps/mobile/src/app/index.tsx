import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeTheme } from "@kontave/ui-native";
import { useAuth } from "../auth/auth-context";
import { AuthScreen } from "../presentation/auth-screen";
import { AuthenticatedHome } from "../presentation/home-screen";

export default function HomeScreen(): React.JSX.Element {
  const auth = useAuth();
  if (auth.state.status === "loading") return <SafeAreaView style={styles.safeArea}><View style={styles.loading}><ActivityIndicator size="large" color={nativeTheme.color.primary} /></View></SafeAreaView>;
  if (auth.state.status === "anonymous") return <AuthScreen />;
  return <SafeAreaView style={styles.safeArea}><AuthenticatedHome /></SafeAreaView>;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    alignSelf: "stretch",
    backgroundColor: nativeTheme.color.background,
    width: "100%",
  },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
});
