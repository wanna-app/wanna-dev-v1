import React from "react";
import { StyleSheet, Text, TextStyle } from "react-native";
import { colors } from "../theme";

interface LogoProps {
  size?: number;
  color?: string;
  style?: TextStyle;
}

export function Logo({ size = 56, color, style }: LogoProps) {
  return (
    <Text
      style={[
        styles.logo,
        { fontSize: size, color: color ?? colors.primary.wannaPurple },
        style,
      ]}
    >
      wanna
    </Text>
  );
}

const styles = StyleSheet.create({
  logo: {
    fontWeight: "900",
    letterSpacing: -1.5,
  },
});
