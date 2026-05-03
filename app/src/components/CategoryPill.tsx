import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Icon, IconName } from "./Icon";
import { categoryIcons, colors, fonts, fontSizes } from "../theme";
import type { ActivityCategory } from "../constants/categories";

interface Props {
  category: ActivityCategory | string;
  /** 'light' = white pill with brand color icon (used on dark photos).
   *  'dark'  = charcoal text on translucent white.
   *  'glass' = translucent white on a photo (used in filter chips). */
  variant?: "light" | "dark" | "glass";
  size?: "sm" | "md" | "lg";
  style?: ViewStyle;
  /** Optional override label (defaults to the category itself). */
  label?: string;
}

export function CategoryPill({
  category,
  variant = "light",
  size = "md",
  style,
  label,
}: Props) {
  const iconName = (categoryIcons[category] ?? "Sparkle") as IconName;

  const sizing = SIZE_TOKENS[size];
  const palette = VARIANT_TOKENS[variant];

  return (
    <View
      style={[
        styles.pill,
        {
          paddingHorizontal: sizing.paddingX,
          paddingVertical: sizing.paddingY,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: palette.border ? 1 : 0,
        },
        style,
      ]}
    >
      <Icon
        name={iconName}
        size={sizing.iconSize}
        color={palette.iconColor}
        weight="bold"
      />
      <Text
        style={[
          styles.label,
          { color: palette.textColor, fontSize: sizing.fontSize },
        ]}
      >
        {label ?? category}
      </Text>
    </View>
  );
}

const SIZE_TOKENS = {
  sm: { paddingX: 10, paddingY: 4, fontSize: 11, iconSize: 12 },
  md: { paddingX: 12, paddingY: 6, fontSize: 12, iconSize: 14 },
  lg: { paddingX: 14, paddingY: 8, fontSize: 13, iconSize: 16 },
} as const;

const VARIANT_TOKENS = {
  light: {
    bg: "rgba(255,255,255,0.95)",
    iconColor: colors.primary.wannaPurple,
    textColor: colors.neutral.charcoal,
    border: undefined as string | undefined,
  },
  dark: {
    bg: colors.neutral.cloud,
    iconColor: colors.primary.wannaPurple,
    textColor: colors.neutral.charcoal,
    border: undefined as string | undefined,
  },
  glass: {
    bg: "rgba(255,255,255,0.18)",
    iconColor: "#FFFFFF",
    textColor: "#FFFFFF",
    border: "rgba(255,255,255,0.32)",
  },
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 9999,
    alignSelf: "flex-start",
  },
  label: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
