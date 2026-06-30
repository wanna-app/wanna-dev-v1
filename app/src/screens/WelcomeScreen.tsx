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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import * as AppleAuthentication from "expo-apple-authentication";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Logo } from "../components/Logo";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { supabase } from "../lib/supabase";
import { colors, spacing, fontSizes, fonts, borderRadius } from "../theme";

const DEMO_EMAIL = "demo@joinwannaapp.com";
const DEMO_PASSWORD = "WannaDemo2026!";
const SHOW_DEMO = process.env.EXPO_PUBLIC_SHOW_DEMO_LOGIN !== "false";

interface WelcomeScreenProps {
  navigation: any;
}

export function WelcomeScreen({ navigation }: WelcomeScreenProps) {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  // Turnstile token for the demo button. Supabase enforces captcha on all
  // signInWithPassword calls, so the demo path needs one too. Only mounted
  // when SHOW_DEMO is true (the captcha widget never ships to launch users).
  const [demoCaptchaToken, setDemoCaptchaToken] = useState<string | null>(null);
  const [demoWidgetKey, setDemoWidgetKey] = useState(0);
  const resetDemoCaptcha = () => {
    setDemoCaptchaToken(null);
    setDemoWidgetKey((k) => k + 1);
  };

  const handleDemo = async () => {
    if (!demoCaptchaToken) {
      Alert.alert("Almost there", "Waiting for verification to finish.");
      return;
    }
    setLoadingProvider("demo");
    const { error } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      options: { captchaToken: demoCaptchaToken },
    });
    setLoadingProvider(null);
    // Single-use token — always remount the widget for a fresh one.
    resetDemoCaptcha();
    if (error) {
      Alert.alert(
        "Demo unavailable",
        "The demo account isn't set up yet. Please use email signup."
      );
      return;
    }
    // Repopulate unread state across the demo's matches so the demo
    // experience always opens with a visible "3" tab badge and bold
    // rows in MatchesListScreen. Fire-and-forget; failure here only
    // means the demo opens looking quieter, not broken.
    try {
      await supabase.rpc("reset_demo_unread_state");
    } catch {
      // non-fatal
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

  // Subtle ambient animation: two soft glow orbs that slowly drift +
  // pulse in opacity over the gradient background. Cheap, runs on the
  // UI thread via reanimated, and gives the screen a sense of "alive"
  // without competing with the tagline / CTAs.
  const orbA = useSharedValue(0);
  const orbB = useSharedValue(0);
  React.useEffect(() => {
    orbA.value = withRepeat(
      withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    orbB.value = withRepeat(
      withTiming(1, { duration: 8000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [orbA, orbB]);
  const orbAStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -40 + orbA.value * 60 },
      { translateX: -20 + orbA.value * 40 },
      { scale: 0.95 + orbA.value * 0.15 },
    ],
    opacity: 0.18 + orbA.value * 0.12,
  }));
  const orbBStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: 30 - orbB.value * 80 },
      { translateX: 10 + orbB.value * -30 },
      { scale: 1 + orbB.value * 0.2 },
    ],
    opacity: 0.14 + orbB.value * 0.14,
  }));

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Drifting glow orbs — pointer-events disabled so they don't
          intercept taps on the buttons below */}
      <Animated.View
        pointerEvents="none"
        style={[styles.orb, styles.orbTopLeft, orbAStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.orb, styles.orbBottomRight, orbBStyle]}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.heroSection}>
          <Logo size={72} color={colors.neutral.white} />
          <Text style={styles.tagline}>Swipe less.{"\n"}Do more.</Text>
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
              Sign up with email
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
            <>
              {/* Turnstile widget for the demo signin. Mounts only while
                  SHOW_DEMO is on, so production users (SHOW_DEMO_LOGIN=false)
                  don't see this widget on Welcome. */}
              <TurnstileWidget
                key={demoWidgetKey}
                onToken={setDemoCaptchaToken}
                onExpire={resetDemoCaptcha}
              />
              {/* Demo pill — same shape + label sizing as the provider
                  pills above so all welcome CTAs read at the same weight. */}
              <Pressable
                onPress={handleDemo}
                disabled={loadingProvider === "demo" || !demoCaptchaToken}
                style={({ pressed }) => [
                  styles.providerBtn,
                  styles.demoBtn,
                  pressed && { opacity: 0.85 },
                  (loadingProvider === "demo" || !demoCaptchaToken) && {
                    opacity: 0.5,
                  },
                ]}
              >
                {loadingProvider === "demo" ? (
                  <ActivityIndicator color={colors.primary.wannaPurple} />
                ) : (
                  <Text style={[styles.providerLabel, styles.emailLabel]}>
                    Try the demo
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

/**
 * Real Google "G" logo — 4-color SVG that matches Google's brand guide.
 * This is the official path; do not modify proportions or colors.
 * Spec: https://developers.google.com/identity/branding-guidelines
 */
function GoogleGlyph({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  orb: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 9999,
    backgroundColor: "#FFFFFF",
  },
  orbTopLeft: {
    top: -120,
    left: -120,
  },
  orbBottomRight: {
    bottom: -140,
    right: -120,
  },
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
    // Apple's native AppleAuthenticationButton renders its label at
    // ~19pt SF Pro Display Medium and we can't override it. Match
    // here so all three primary pills (Email, Google, Apple) read
    // at the same visual weight + size.
    fontSize: 19,
    fontWeight: "500",
  },
  // Email — primary CTA: solid brand purple with white label.
  emailBtn: {
    backgroundColor: colors.primary.wannaPurple,
  },
  emailLabel: {
    color: colors.neutral.white,
    // Slight bump (+0.5pt over providerLabel) so the bold-white "Sign up
    // with email" pill reads at the same optical weight as the Google
    // and Apple labels, which use darker text on lighter backgrounds.
    fontSize: 19.5,
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
    fontSize: 15,
    fontWeight: "400",
    marginTop: spacing.md,
    textDecorationLine: "underline",
  },
  // Try-the-demo pill — same shape as the email/google buttons but
  // a bit translucent so it reads as a tertiary action.
  demoBtn: {
    backgroundColor: "rgba(255,255,255,0.55)",
    marginTop: spacing.md,
  },
});
