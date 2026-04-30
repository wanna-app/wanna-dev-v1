import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { colors, spacing, borderRadius, fontSizes } from "../theme";

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  helper?: string;
}

export function TextField({
  label,
  error,
  helper,
  style,
  ...inputProps
}: TextFieldProps) {
  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.neutral.slate}
        style={[styles.input, error && styles.inputError, style]}
        {...inputProps}
      />
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSizes.caption,
    color: colors.neutral.charcoal,
    marginBottom: spacing.xs,
    fontWeight: "600",
  },
  input: {
    height: 52,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  inputError: {
    borderColor: "#E53E3E",
  },
  error: {
    fontSize: fontSizes.caption,
    color: "#E53E3E",
    marginTop: spacing.xs,
  },
  helper: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginTop: spacing.xs,
  },
});
