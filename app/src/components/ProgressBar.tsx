import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, borderRadius } from "../theme";

interface ProgressBarProps {
  step: number;
  totalSteps: number;
}

export function ProgressBar({ step, totalSteps }: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, step / totalSteps));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.full,
    overflow: "hidden",
    width: "100%",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.primary.wannaPurple,
    borderRadius: borderRadius.full,
  },
});
