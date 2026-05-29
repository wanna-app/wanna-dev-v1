import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { TurnstileWidget } from "../components/TurnstileWidget";
import { supabase } from "../lib/supabase";
import { colors, spacing, fontSizes } from "../theme";

interface Props {
  navigation: any;
}

export function EmailSignUpScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  // Turnstile token (single-use). null until the widget issues one.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bump to force-remount the widget for a fresh token after a token
  // is consumed (success or failure) or expires.
  const [widgetKey, setWidgetKey] = useState(0);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setWidgetKey((k) => k + 1);
  };

  // Mirror Supabase Auth's password policy so the user gets clear inline
  // guidance instead of a raw server error. Policy: 8+ chars with at
  // least one lowercase, one uppercase, one digit, and one symbol.
  const passwordError = (pw: string): string | null => {
    if (pw.length < 8) return "Use at least 8 characters";
    if (!/[a-z]/.test(pw)) return "Missing a lowercase letter";
    if (!/[A-Z]/.test(pw)) return "Missing an uppercase letter";
    if (!/[0-9]/.test(pw)) return "Missing a number";
    if (!/[^A-Za-z0-9]/.test(pw)) return "Missing a symbol (e.g. ! ? @ #)";
    return null;
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.includes("@")) e.email = "Enter a valid email";
    const pwErr = passwordError(password);
    if (pwErr) e.password = pwErr;
    if (password !== confirmPassword) e.confirmPassword = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    if (!captchaToken) {
      Alert.alert("Almost there", "Please wait for the verification to finish.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { captchaToken },
    });
    setLoading(false);
    // Turnstile tokens are single-use — always reset after an attempt.
    resetCaptcha();
    if (error) {
      Alert.alert("Sign up failed", error.message);
      return;
    }
    // Confirm-email is OFF in Supabase, so signUp returns a session and the
    // auth state change routes us straight into onboarding (RootNavigator).
    // No bounce to the sign-in screen, no blocking alert — the closeable
    // "Confirm your email" nudge (GlobalConfirmEmailModal) handles the
    // reminder from here on. Nothing to navigate; just let auth state drive.
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backText}>← Back</Text>
          </Pressable>

          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>
            We'll use your email to keep your account secure.
          </Text>

          <View style={styles.form}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={errors.email}
              placeholder="you@example.com"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              error={errors.password}
              helper="8+ characters with uppercase & lowercase letters, a number, and a symbol"
              placeholder="••••••••"
            />
            <TextField
              label="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
              error={errors.confirmPassword}
              placeholder="••••••••"
            />
          </View>

          <TurnstileWidget
            key={widgetKey}
            onToken={setCaptchaToken}
            onExpire={resetCaptcha}
            style={{ marginTop: spacing.md }}
          />

          <Button
            label="Create account"
            variant="gradient"
            onPress={handleSignUp}
            loading={loading}
            disabled={!captchaToken}
            style={{ marginTop: spacing.md }}
          />

          <Pressable
            onPress={() => navigation.navigate("EmailSignIn")}
            style={styles.switchLink}
          >
            <Text style={styles.switchText}>
              Already have an account?{" "}
              <Text style={styles.switchTextBold}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  scroll: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  backButton: {
    marginBottom: spacing.lg,
  },
  backText: {
    fontSize: fontSizes.body,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
  },
  title: {
    fontSize: fontSizes.display,
    fontWeight: "800",
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    marginBottom: spacing.xl,
  },
  form: {
    width: "100%",
  },
  switchLink: {
    marginTop: spacing.lg,
    alignSelf: "center",
  },
  switchText: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
  },
  switchTextBold: {
    color: colors.primary.wannaPurple,
    fontWeight: "700",
  },
});
