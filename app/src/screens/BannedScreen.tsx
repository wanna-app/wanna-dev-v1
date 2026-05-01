import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../hooks/useAuth";
import { colors, fonts, fontSizes, spacing } from "../theme";

/**
 * Full-screen suspension notice shown when `profile.is_active === false`.
 *
 * - Temp ban   (banned_until is set):   shows expiry date + ban_reason
 * - Perm ban   (banned_until is null):  shows ban_reason, no expiry
 *
 * No navigation, no tabs — the user cannot interact with the app until
 * the ban expires (handled server-side by auto-unban) or is lifted manually.
 */
export function BannedScreen() {
  const { profile, signOut } = useAuth();

  const isPermanent = !profile?.banned_until;

  const expiryStr = profile?.banned_until
    ? new Date(profile.banned_until).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.icon}>🚫</Text>

        <Text style={styles.title}>
          {isPermanent ? "Account permanently suspended" : "Account suspended"}
        </Text>

        {isPermanent ? (
          <Text style={styles.body}>
            Your Wanna account has been permanently suspended for violating our
            community guidelines.
          </Text>
        ) : (
          <Text style={styles.body}>
            Your Wanna account has been temporarily suspended.{"\n"}
            It will be automatically reactivated on{" "}
            <Text style={styles.bodyBold}>{expiryStr}</Text>.
          </Text>
        )}

        {!!profile?.ban_reason && (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>Reason</Text>
            <Text style={styles.reasonText}>{profile.ban_reason}</Text>
          </View>
        )}

        <Text style={styles.contact}>
          If you believe this was a mistake, contact us at{"\n"}
          <Text style={styles.contactEmail}>hello@joinwannaapp.com</Text>
        </Text>

        {/* Allow sign-out so they can try a different account */}
        <Pressable style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  inner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  icon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    textAlign: "center",
    marginBottom: spacing.md,
  },
  body: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: spacing.lg,
    maxWidth: 320,
  },
  bodyBold: {
    color: colors.neutral.charcoal,
    fontWeight: "700",
  },
  reasonBox: {
    backgroundColor: colors.neutral.cloud,
    borderRadius: 12,
    padding: spacing.md,
    width: "100%",
    maxWidth: 320,
    marginBottom: spacing.lg,
  },
  reasonLabel: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    lineHeight: 22,
  },
  contact: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  contactEmail: {
    color: colors.primary.wannaPurple,
    fontWeight: "600",
  },
  signOutBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  signOutText: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    fontWeight: "600",
  },
});
