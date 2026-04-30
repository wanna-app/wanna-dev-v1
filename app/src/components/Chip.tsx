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

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.neutral.cloud,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  chipSelected: {
    backgroundColor: colors.primary.lavenderMist,
    borderColor: colors.primary.wannaPurple,
  },
  label: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    fontWeight: "600",
  },
  labelSelected: {
    color: colors.primary.royalPurple,
  },
});
