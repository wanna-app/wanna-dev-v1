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

export function EmailSignUpScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!email.includes("@")) e.email = "Enter a valid email";
    if (password.length < 8) e.password = "Min 8 characters";
    if (password !== confirmPassword) e.confirmPassword = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSignUp = async () => {
    if (!validate()) return;
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) {
      Alert.alert("Sign up failed", error.message);
      return;
    }
    Alert.alert(
      "Check your email",
      "We sent you a confirmation link. Confirm your email, then come back to sign in."
    );
    navigation.navigate("EmailSignIn");
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
              helper="At least 8 characters"
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

          <Button
            label="Create account"
            variant="gradient"
            onPress={handleSignUp}
            loading={loading}
            style={{ marginTop: spacing.lg }}
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
