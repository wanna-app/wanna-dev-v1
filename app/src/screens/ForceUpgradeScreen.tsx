import React from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, fontSizes, spacing, borderRadius } from "../theme";

type Props = {
  storeUrl: string;
  minVersion: string;
  runningVersion: string;
};

/**
 * Blocking full-screen "please update" prompt. Mounted at the root of
 * the app tree when useAppVersionGate returns "outdated" — sits above
 * AuthProvider / RootNavigator so the user can't get past it without
 * upgrading or force-quitting.
 */
export function ForceUpgradeScreen({ storeUrl, minVersion, runningVersion }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.content}>
        <Text style={styles.emoji}>👋</Text>
        <Text style={styles.title}>Time to update</Text>
        <Text style={styles.body}>
          You're on Wanna v{runningVersion}. The minimum supported version is
          v{minVersion}. Update to keep using the app — your account and
          everything in it is safe and waiting.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => {
            Linking.openURL(storeUrl).catch(() => {});
          }}
        >
          <Text style={styles.buttonText}>Update Wanna</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  button: {
    backgroundColor: colors.primary.wannaPurple,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
  },
  buttonText: {
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: "500",
    color: colors.neutral.white,
  },
});
