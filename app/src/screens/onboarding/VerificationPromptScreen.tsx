import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "../../components/Button";
import { ProgressBar } from "../../components/ProgressBar";
import { colors, spacing, fontSizes, borderRadius } from "../../theme";

interface Props {
  navigation: any;
}

export function VerificationPromptScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ProgressBar step={5} totalSteps={6} />
        <View style={styles.iconWrapper}>
          <LinearGradient
            colors={[colors.gradient.start, colors.gradient.end]}
            style={styles.iconCircle}
          >
            <Text style={styles.checkmark}>✓</Text>
          </LinearGradient>
        </View>
        <Text style={styles.title}>Get verified</Text>
        <Text style={styles.subtitle}>
          Verified profiles are more likely to get matches. Take a quick selfie
          to confirm you're you. Your verification photo is private — only the
          moderation team sees it.
        </Text>
      </View>
      <View style={styles.footer}>
        <Button
          label="Verify now"
          variant="gradient"
          onPress={() => navigation.navigate("Preferences")}
        />
        <Button
          label="Skip for now"
          variant="ghost"
          onPress={() => navigation.navigate("Preferences")}
          style={{ marginTop: spacing.sm }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    alignItems: "center",
  },
  footer: {
    padding: spacing.lg,
  },
  iconWrapper: {
    marginTop: spacing.xxl,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmark: {
    fontSize: 56,
    color: colors.neutral.white,
    fontWeight: "800",
  },
  title: {
    fontSize: fontSizes.display,
    fontWeight: "800",
    color: colors.neutral.charcoal,
    textAlign: "center",
  },
  subtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
    marginTop: spacing.md,
    lineHeight: 24,
  },
});
