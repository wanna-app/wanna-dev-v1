import React from "react";
import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, spacing, borderRadius, fontSizes } from "../theme";

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Chip({ label, selected, onPress, style }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, style]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>
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
  chipSelected: {
    backgroundColor: colors.primary.lavenderMist,
    borderColor: colors.primary.wannaPurple,
  },
  label: {
    fontSize: 12,
    color: colors.neutral.charcoal,
    fontWeight: "600",
  },
  labelSelected: {
    color: colors.primary.royalPurple,
  },
});
