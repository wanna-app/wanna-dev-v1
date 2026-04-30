import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, borderRadius, fontSizes } from "../theme";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "gradient";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  style,
  fullWidth = true,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  if (variant === "gradient") {
    return (
      <Pressable
        onPress={onPress}
        disabled={isDisabled}
        style={[fullWidth && { width: "100%" }, style, isDisabled && { opacity: 0.6 }]}
      >
        <LinearGradient
          colors={[colors.gradient.start, colors.gradient.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.button}
        >
          {loading ? (
            <ActivityIndicator color={colors.neutral.white} />
          ) : (
            <View style={styles.content}>
              {icon}
              <Text style={[styles.label, styles.labelOnDark]}>{label}</Text>
            </View>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  const buttonStyle = [
    styles.button,
    variant === "primary" && styles.primary,
    variant === "secondary" && styles.secondary,
    variant === "outline" && styles.outline,
    variant === "ghost" && styles.ghost,
    fullWidth && { width: "100%" as const },
    isDisabled && { opacity: 0.6 },
    style,
  ];

  const labelStyle = [
    styles.label,
    (variant === "primary" || variant === "secondary") && styles.labelOnDark,
    (variant === "outline" || variant === "ghost") && styles.labelOnLight,
  ];

  return (
    <Pressable onPress={onPress} disabled={isDisabled} style={buttonStyle}>
      {loading ? (
        <ActivityIndicator
          color={
            variant === "outline" || variant === "ghost"
              ? colors.primary.wannaPurple
              : colors.neutral.white
          }
        />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={labelStyle}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.primary.wannaPurple,
  },
  secondary: {
    backgroundColor: colors.neutral.charcoal,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.primary.wannaPurple,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: "600",
  },
  labelOnDark: {
    color: colors.neutral.white,
  },
  labelOnLight: {
    color: colors.primary.wannaPurple,
  },
});
