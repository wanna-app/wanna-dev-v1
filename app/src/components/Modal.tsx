import React from "react";
import {
  Modal as RNModal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";

interface ModalProps {
  visible: boolean;
  title?: string;
  body?: string;
  onDismiss?: () => void;
  children?: React.ReactNode;
}

export function Modal({ visible, title, body, onDismiss, children }: ModalProps) {
  return (
    <RNModal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          {title && <Text style={styles.title}>{title}</Text>}
          {body && <Text style={styles.body}>{body}</Text>}
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
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
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
});
