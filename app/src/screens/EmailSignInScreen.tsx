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
import { supabase } from "../lib/supabase";
import { colors, spacing, fontSizes } from "../theme";

interface Props {
  navigation: any;
}

export function EmailSignInScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Missing info", "Enter your email and password.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) Alert.alert("Sign in failed", error.message);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      Alert.alert("Email required", "Enter your email first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase()
    );
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

          <Button
            label="Sign in"
            variant="gradient"
            onPress={handleSignIn}
            loading={loading}
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
