import React from "react";
import { StyleSheet, Text, TextStyle } from "react-native";
import { colors, fonts } from "../theme";

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
    fontFamily: fonts.display,
    letterSpacing: -1.5,
  },
});
