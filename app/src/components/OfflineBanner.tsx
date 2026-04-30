import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useNetwork } from "../hooks/useNetwork";
import { colors, spacing, fontSizes } from "../theme";

export function OfflineBanner() {
  const { online } = useNetwork();
  if (online) return null;
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        🚫 You're offline — your actions will sync when you reconnect.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.neutral.charcoal,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  text: {
    color: colors.neutral.white,
    fontSize: fontSizes.caption,
    textAlign: "center",
    fontWeight: "600",
  },
});
