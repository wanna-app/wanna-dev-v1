import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { ProgressBar } from "../../components/ProgressBar";
import { useOnboarding } from "../../hooks/useOnboarding";
import { colors, spacing, fontSizes } from "../../theme";

interface Props {
  navigation: any;
}

export function NameScreen({ navigation }: Props) {
  const { data, update } = useOnboarding();
  const [name, setName] = useState(data.first_name);
  const [error, setError] = useState("");

  const handleNext = () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 30) {
      setError("Enter your first name (1–30 characters)");
      return;
    }
    update({ first_name: trimmed });
    navigation.navigate("DOB");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content}>
          <ProgressBar step={1} totalSteps={6} />
          <Text style={styles.title}>What's your first name?</Text>
          <Text style={styles.subtitle}>This is how others will see you.</Text>
          <TextField
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError("");
            }}
            placeholder="Your first name"
            autoCapitalize="words"
            autoFocus
            error={error}
            maxLength={30}
          />
        </View>
        <View style={styles.footer}>
          <Button label="Next" variant="gradient" onPress={handleNext} />
        </View>
      </KeyboardAvoidingView>
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
    gap: spacing.md,
  },
  footer: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.display,
    fontWeight: "800",
    color: colors.neutral.charcoal,
    marginTop: spacing.lg,
  },
  subtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    marginBottom: spacing.lg,
  },
});
