import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { useAuth } from "../../hooks/useAuth";
import { colors, spacing, fontSizes } from "../../theme";

interface Props {
  title: string;
  description?: string;
  showSignOut?: boolean;
}

export function PlaceholderScreen({ title, description, showSignOut }: Props) {
  const { signOut, profile } = useAuth();
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {description ?? "Coming soon — this tab will ship in the next milestone."}
        </Text>
        {profile && (
          <Text style={styles.profileText}>
            Signed in as {profile.first_name}
          </Text>
        )}
        {showSignOut && (
          <Button
            label="Sign out"
            variant="outline"
            onPress={signOut}
            style={{ marginTop: spacing.lg }}
          />
        )}
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
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.display,
    fontWeight: "800",
    color: colors.primary.wannaPurple,
  },
  subtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
    marginTop: spacing.md,
    maxWidth: 280,
  },
  profileText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginTop: spacing.lg,
  },
});
