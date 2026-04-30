import React, { useState } from "react";
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as AppleAuthentication from "expo-apple-authentication";
import { Button } from "../components/Button";
import { Logo } from "../components/Logo";
import { supabase } from "../lib/supabase";
import { colors, spacing, fontSizes } from "../theme";

const DEMO_EMAIL = "demo@joinwannaapp.com";
const DEMO_PASSWORD = "WannaDemo2026!";
const SHOW_DEMO = process.env.EXPO_PUBLIC_SHOW_DEMO_LOGIN !== "false";

interface WelcomeScreenProps {
  navigation: any;
}

export function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const handleDemo = async () => {
    setLoadingProvider("demo");
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    setLoadingProvider(null);
    if (error) {
      Alert.alert(
        "Demo unavailable",
        "The demo account isn't set up yet. Please use email signup."
      );
    }
  };

  const handleGoogle = async () => {
    setLoadingProvider("google");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "wanna://auth-callback" },
    });
    setLoadingProvider(null);
    if (error) Alert.alert("Sign in failed", error.message);
  };

  const handleApple = async () => {
    if (Platform.OS !== "ios") {
      Alert.alert("Apple Sign-In", "Available on iOS only.");
      return;
    }
    try {
      setLoadingProvider("apple");
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: credential.identityToken,
        });
        if (error) Alert.alert("Sign in failed", error.message);
      }
    } catch (e: any) {
      if (e.code !== "ERR_REQUEST_CANCELED") {
        Alert.alert("Apple Sign-In failed", e.message ?? "Unknown error");
      }
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.heroSection}>
          <Logo size={72} color={colors.neutral.white} />
          <Text style={styles.tagline}>
            Match by what you{"\n"}wanna do.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button
            label="Continue with Email"
            variant="primary"
            onPress={() => navigation.navigate("EmailSignUp")}
            style={styles.primaryAction}
          />
          <Button
            label="Continue with Google"
            variant="outline"
            onPress={handleGoogle}
            loading={loadingProvider === "google"}
            style={styles.providerButton}
          />
          {Platform.OS === "ios" && (
            <Button
              label="Continue with Apple"
              variant="secondary"
              onPress={handleApple}
              loading={loadingProvider === "apple"}
              style={styles.providerButton}
            />
          )}
          <Text
            style={styles.signInLink}
            onPress={() => navigation.navigate("EmailSignIn")}
          >
            Already have an account? Sign in
          </Text>

          {SHOW_DEMO && (
            <Button
              label="Try the Demo"
              variant="ghost"
              onPress={handleDemo}
              loading={loadingProvider === "demo"}
              style={styles.demoButton}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: "space-between",
  },
  heroSection: {
    flex: 1,
    justifyContent: "center",
    alignItems: "flex-start",
    paddingTop: spacing.xxl,
  },
  tagline: {
    fontSize: fontSizes.display,
    color: colors.neutral.white,
    fontWeight: "700",
    marginTop: spacing.lg,
    lineHeight: 38,
  },
  actions: {
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  primaryAction: {
    backgroundColor: colors.neutral.white,
  },
  providerButton: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderColor: colors.neutral.white,
  },
  signInLink: {
    color: colors.neutral.white,
    textAlign: "center",
    fontSize: fontSizes.body,
    marginTop: spacing.md,
    textDecorationLine: "underline",
  },
  demoButton: {
    backgroundColor: "rgba(0,0,0,0.2)",
    marginTop: spacing.md,
  },
});
