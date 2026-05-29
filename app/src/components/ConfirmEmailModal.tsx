import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";

interface Props {
  /** Whether the modal is shown. */
  visible: boolean;
  /** The unconfirmed email address (shown in the body). */
  email: string;
  /** "Resend link" tapped. */
  onResend: () => void;
  /** "I'll do it later" tapped (dismiss for this session). */
  onDismiss: () => void;
  /** True while the resend request is in flight. */
  resending?: boolean;
}

/**
 * Closeable nudge shown on app open while the signed-in user's email is
 * still unconfirmed. Confirm-email is OFF in Supabase (users get a session
 * immediately and go straight to onboarding), so this is how we keep
 * prompting them to confirm without blocking access.
 */
export function ConfirmEmailModal({
  visible,
  email,
  onResend,
  onDismiss,
  resending,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Confirm your email</Text>
          <Text style={styles.body}>
            We sent a confirmation link to{" "}
            <Text style={styles.email}>{email}</Text>. Please confirm to secure
            your account and keep getting match & message alerts.
          </Text>

          <Button
            label={resending ? "Sending…" : "Resend link"}
            variant="gradient"
            onPress={onResend}
            loading={resending}
            style={styles.resendButton}
          />

          <Pressable onPress={onDismiss} style={styles.laterButton}>
            <Text style={styles.laterText}>I'll do it later</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    fontWeight: "800",
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  body: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  email: {
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  resendButton: {
    width: "100%",
  },
  laterButton: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  laterText: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    fontWeight: "600",
  },
});
