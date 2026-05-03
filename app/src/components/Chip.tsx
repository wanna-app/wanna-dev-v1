import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, borderRadius } from "../theme";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
  /** Optional accent color used when selected. Defaults to brand purple.
   *  Use the per-category color from `categoryGradients[category][1]` (the
   *  middle stop) to give Post Activity / Discover their multi-color feel. */
  accentColor?: string;
}

/**
 * Lightens a hex color by mixing it with white at the given amount (0-1).
 * Used to derive a soft selected-background from the accent color.
 */
function lightenHex(hex: string, mix: number): string {
  const m = hex.replace(/^#/, "");
  const num = parseInt(m, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const lr = Math.round(r + (255 - r) * mix);
  const lg = Math.round(g + (255 - g) * mix);
  const lb = Math.round(b + (255 - b) * mix);
  return `#${((1 << 24) | (lr << 16) | (lg << 8) | lb).toString(16).slice(1)}`;
}

/**
 * Darkens a hex color by mixing toward black at the given amount (0-1).
 * Used to give the selected label a readable, on-brand text color when
 * the chip background is the lightened accent.
 */
function darkenHex(hex: string, mix: number): string {
  const m = hex.replace(/^#/, "");
  const num = parseInt(m, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const dr = Math.round(r * (1 - mix));
  const dg = Math.round(g * (1 - mix));
  const db = Math.round(b * (1 - mix));
  return `#${((1 << 24) | (dr << 16) | (dg << 8) | db).toString(16).slice(1)}`;
}

export function Chip({ label, selected, onPress, style, accentColor }: ChipProps) {
  const accent = accentColor ?? colors.primary.wannaPurple;
  const selectedBg = lightenHex(accent, 0.78);   // very soft tint
  const selectedBorder = accent;
  const selectedFg = darkenHex(accent, 0.4);

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        selected && {
          backgroundColor: selectedBg,
          borderColor: selectedBorder,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          selected && { color: selectedFg },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Sized to match the mockup's compact chip: 10px h-padding, 5px v-padding,
// 12pt label. Smaller than before so chip clusters (categories, lifestyle,
// shared interests) don't dominate the layout.
const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral.cloud,
    borderWidth: 1,
    borderColor: "transparent",
  },
  label: {
    fontSize: 12,
    color: colors.neutral.charcoal,
    fontWeight: "600",
  },
});
