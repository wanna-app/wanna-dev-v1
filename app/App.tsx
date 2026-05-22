import "react-native-gesture-handler";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import * as Sentry from "@sentry/react-native";
import { AuthProvider } from "./src/hooks/useAuth";
import { NetworkProvider } from "./src/hooks/useNetwork";
import { useAppVersionGate } from "./src/hooks/useAppVersionGate";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { ForceUpgradeScreen } from "./src/screens/ForceUpgradeScreen";
import { colors } from "./src/theme";

// Sentry — crash + error reporting. DSN is public-safe per Sentry's
// design (it's a write-only ingest endpoint, not an API key). Guarded
// by presence-check so dev environments without a DSN don't try to
// init. tracesSampleRate keeps performance-trace volume low for free-
// tier quota; raise for production debugging when needed.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    debug: __DEV__,
  });
}

function App() {
  const [fontsLoaded] = useFonts({
    VAGRoundedBold: require("./assets/fonts/VAGRoundedBold.ttf"),
  });
  // Cold-boot version check. While loading, we render the same splash
  // as the font load so users don't see a flicker. If outdated, we
  // render ForceUpgradeScreen at the root, blocking access to the
  // rest of the app tree until the user upgrades.
  const versionGate = useAppVersionGate();

  if (!fontsLoaded || versionGate.status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.neutral.white,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
      </View>
    );
  }

  if (versionGate.status === "outdated") {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="auto" />
          <ForceUpgradeScreen
            storeUrl={versionGate.storeUrl}
            minVersion={versionGate.minVersion}
            runningVersion={versionGate.runningVersion}
          />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <AuthProvider>
            <StatusBar style="auto" />
            <OfflineBanner />
            <RootNavigator />
          </AuthProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Sentry.wrap installs an error boundary that captures React render
// errors automatically. No-op if Sentry wasn't initialized (no DSN).
export default Sentry.wrap(App);
