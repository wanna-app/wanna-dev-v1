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

export function EmailSignInScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // Turnstile token (single-use). null until the widget issues one.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bump to force-remount the widget for a fresh token after use/expiry.
  const [widgetKey, setWidgetKey] = useState(0);

  const resetCaptcha = () => {
    setCaptchaToken(null);
    setWidgetKey((k) => k + 1);
  };

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }
    if (!captchaToken) {
      Alert.alert("Almost there", "Please wait for the verification to finish.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
      options: { captchaToken },
    });
    setLoading(false);
    // Turnstile tokens are single-use — always reset after an attempt.
    resetCaptcha();
    if (error) Alert.alert("Sign in failed", error.message);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert("Email required", "Enter your email first.");
      return;
    }
    if (!captchaToken) {
      Alert.alert("Almost there", "Please wait for the verification to finish.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { captchaToken }
    );
    // Single-use token — reset whether or not the request succeeded.
    resetCaptcha();
    if (error) {
      Alert.alert("Reset failed", error.message);
    } else {
      Alert.alert("Check your email", "We sent you a password reset link.");
    }
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

          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          <View style={styles.form}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholder="••••••••"
            />
          </View>

          <Pressable onPress={handleForgotPassword} style={styles.forgotLink}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>

          <TurnstileWidget
            key={widgetKey}
            onToken={setCaptchaToken}
            onExpire={resetCaptcha}
          />

          <Button
            label="Sign in"
            variant="gradient"
            onPress={handleSignIn}
            loading={loading}
            disabled={!captchaToken}
            style={{ marginTop: spacing.md }}
          />

          <Pressable
            onPress={() => navigation.navigate("EmailSignUp")}
            style={styles.switchLink}
          >
            <Text style={styles.switchText}>
              New to Wanna?{" "}
              <Text style={styles.switchTextBold}>Create an account</Text>
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
  forgotLink: {
    alignSelf: "flex-end",
    marginBottom: spacing.md,
  },
  forgotText: {
    fontSize: fontSizes.caption,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
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
