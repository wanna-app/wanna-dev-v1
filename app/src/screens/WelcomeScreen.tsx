import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Button } from "../components/Button";
import { Logo } from "../components/Logo";
import { supabase } from "../lib/supabase";
import { colors, spacing, fontSizes, borderRadius } from "../theme";

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
    try {
      setLoadingProvider("google");
      const redirectTo = Linking.createURL("auth-callback");

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("Couldn't start sign-in");

      const result = await WebBrowser.openAuthSessionAsync(
        data.url,
        redirectTo
      );
      if (result.type !== "success" || !result.url) return;

      const parsed = new URL(result.url);
      const params = new URLSearchParams(
        parsed.search.replace(/^\?/, "") +
          "&" +
          parsed.hash.replace(/^#/, "")
      );
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken || !refreshToken) {
        throw new Error("Missing tokens in redirect URL");
      }
      const { error: setErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (setErr) throw setErr;
    } catch (e: any) {
      Alert.alert("Sign in failed", e.message ?? "Couldn't sign in with Google");
    } finally {
      setLoadingProvider(null);
    }
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
          {/* Email — white pill with purple text (was blank/invisible before) */}
          <Pressable
            onPress={() => navigation.navigate("EmailSignUp")}
            style={({ pressed }) => [
              styles.providerBtn,
              styles.emailBtn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.providerLabel, styles.emailLabel]}>
              Continue with Email
            </Text>
          </Pressable>

          {/* Google — official branding: white pill, "G" logo, dark gray text */}
          <Pressable
            onPress={handleGoogle}
            disabled={loadingProvider === "google"}
            style={({ pressed }) => [
              styles.providerBtn,
              styles.googleBtn,
              pressed && { opacity: 0.85 },
              loadingProvider === "google" && { opacity: 0.7 },
            ]}
          >
            {loadingProvider === "google" ? (
              <ActivityIndicator color="#5F6368" />
            ) : (
              <View style={styles.providerInner}>
                <GoogleGlyph />
                <Text style={[styles.providerLabel, styles.googleLabel]}>
                  Continue with Google
                </Text>
              </View>
            )}
          </Pressable>

          {/* Apple — use the system AppleAuthenticationButton on iOS */}
          {Platform.OS === "ios" && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={
                AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={borderRadius.full}
              style={styles.appleBtn}
              onPress={handleApple}
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

/**
 * Inline SVG-ish "G" using stacked Views — keeps us off another dep.
 * Renders as Google's 4-color G in the right proportions for a 20pt button.
 */
function GoogleGlyph() {
  return (
    <View style={glyph.box}>
      <Text style={glyph.g}>G</Text>
    </View>
  );
}

const glyph = StyleSheet.create({
  box: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  // Single-color "G" — close enough to brand without bundling SVG/icon lib.
  // Real Google sign-in button policy allows monochrome on white.
  g: {
    fontSize: 18,
    fontWeight: "900",
    color: "#4285F4",
    fontFamily: Platform.select({ ios: "Helvetica", default: undefined }),
  },
});

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
  providerBtn: {
    height: 52,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  providerInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  providerLabel: {
    fontSize: fontSizes.body,
    fontWeight: "600",
  },
  // Email — solid white with purple label
  emailBtn: {
    backgroundColor: colors.neutral.white,
  },
  emailLabel: {
    color: colors.primary.wannaPurple,
  },
  // Google — white per Google brand guide, dark gray Roboto-style text
  googleBtn: {
    backgroundColor: colors.neutral.white,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  googleLabel: {
    color: "#3C4043",
  },
  // Apple — native button, just sized to match
  appleBtn: {
    height: 52,
    width: "100%",
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
