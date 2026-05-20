import "react-native-gesture-handler";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { AuthProvider } from "./src/hooks/useAuth";
import { NetworkProvider } from "./src/hooks/useNetwork";
import { useAppVersionGate } from "./src/hooks/useAppVersionGate";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { OfflineBanner } from "./src/components/OfflineBanner";
import { ForceUpgradeScreen } from "./src/screens/ForceUpgradeScreen";
import { colors } from "./src/theme";

export default function App() {
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
