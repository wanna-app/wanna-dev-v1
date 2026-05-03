import React from "react";
import { Image, StyleSheet, Text, View, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme";

interface AvatarProps {
  /** Display name. First initial is used for the fallback. */
  name?: string;
  /** Pre-resolved image URL. If null/undefined, shows initials on a gradient. */
  uri?: string | null;
  /** Pixel size (avatar is square). */
  size?: number;
  /** White ring around the avatar (used in the Match screen). */
  ring?: boolean;
  ringColor?: string;
  style?: ViewStyle;
}

// Stable name → gradient hash so repeat renders of the same avatar don't flash
// different colors. Returns one of 5 brand-derived two-stop gradients.
const FALLBACK_GRADIENTS: Array<[string, string]> = [
  [colors.primary.softViolet, colors.primary.wannaPurple],
  [colors.primary.wannaPurple, colors.primary.deepViolet],
  [colors.secondary.wannaCyan, colors.secondary.wannaTeal],
  [colors.primary.lavenderMist, colors.secondary.iceCyan],
  [colors.primary.softViolet, colors.secondary.wannaCyan],
];

function pickGradient(name: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return FALLBACK_GRADIENTS[hash % FALLBACK_GRADIENTS.length];
}

export function Avatar({
  name = "?",
  uri,
  size = 40,
  ring = false,
  ringColor = "#FFFFFF",
  style,
}: AvatarProps) {
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const ringPadding = ring ? 2 : 0;
  const inner = size - ringPadding * 2;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: ring ? ringColor : "transparent",
          padding: ringPadding,
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[styles.image, { width: inner, height: inner, borderRadius: inner / 2 }]}
        />
      ) : (
        <LinearGradient
          colors={pickGradient(name)}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.fallback,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          <Text style={[styles.initial, { fontSize: Math.round(inner * 0.42) }]}>
            {initial}
          </Text>
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.neutral.cloud },
  fallback: { alignItems: "center", justifyContent: "center" },
  initial: { color: "#FFFFFF", fontWeight: "700" },
});
