import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Icon } from "./Icon";
import { colors, fonts, fontSizes, shadows, spacing } from "../theme";

interface FirstMessageModalProps {
  visible: boolean;
  /** Activity title (e.g. "KBBQ at Park's BBQ") for the prompt copy. */
  activityTitle: string;
  /** Poster's first name (e.g. "Jordan") — used in the placeholder. */
  posterName: string;
  /** Called with the trimmed message when the user taps Send.
   *  An empty string here means the user skipped — caller decides
   *  whether to write NULL. */
  onSubmit: (message: string) => void;
  /** Tapping Skip / closing dismisses without sending. */
  onSkip: () => void;
}

const MAX = 300;

/**
 * Optional first-message prompt shown right after a user swipes right
 * (or taps "I'm in") on a Discover card. Sits between the swipe and the
 * next card so the user can attach a one-line outreach note that the
 * activity poster sees on the Who's In list.
 *
 * Skipping is first-class — the modal has equally weighted Skip + Send
 * affordances. Default state on open is empty string; auto-focused so
 * the keyboard rises immediately.
 */
export function FirstMessageModal({
  visible,
  activityTitle,
  posterName,
  onSubmit,
  onSkip,
}: FirstMessageModalProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Reset the field every time the modal opens so the previous draft
  // doesn't leak between activities.
  useEffect(() => {
    if (visible) {
      setText("");
      // Slight delay lets the modal animate in before we steal focus,
      // otherwise the keyboard fights with the slide-up animation.
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [visible]);

  const trimmed = text.trim();
  const remaining = MAX - text.length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onSkip}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.scrim}
      >
        <Pressable style={styles.scrimTap} onPress={onSkip} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>You're in!</Text>
            <Pressable onPress={onSkip} hitSlop={10}>
              <Icon name="X" size={20} color={colors.neutral.slate} weight="bold" />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>
            Want to send {posterName} a quick note about{" "}
            <Text style={styles.subtitleBold}>{activityTitle}</Text>? It'll
            show up on their Who's In list.
          </Text>

          <TextInput
            ref={inputRef}
            value={text}
            onChangeText={(v) => {
              if (v.length <= MAX) setText(v);
            }}
            placeholder={`Hey ${posterName}, I'd love to join…`}
            placeholderTextColor={colors.neutral.slate}
            multiline
            style={styles.input}
            maxLength={MAX}
            returnKeyType="default"
          />
          <Text style={styles.counter}>
            {remaining} {remaining === 1 ? "character" : "characters"} left
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.skipBtn} onPress={onSkip}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
            <Pressable
              style={[
                styles.sendBtn,
                trimmed.length === 0 && styles.sendBtnDisabled,
              ]}
              onPress={() => trimmed.length > 0 && onSubmit(trimmed)}
              disabled={trimmed.length === 0}
            >
              <Icon name="ChatCircle" size={16} color="#FFFFFF" weight="bold" />
              <Text style={styles.sendText}>Send note</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  scrimTap: { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    ...shadows.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  subtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    lineHeight: 21,
  },
  subtitleBold: {
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  input: {
    minHeight: 96,
    maxHeight: 160,
    backgroundColor: colors.bg.subtle,
    borderRadius: 14,
    padding: 14,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    textAlignVertical: "top",
  },
  counter: {
    fontSize: 11,
    color: colors.neutral.slate,
    textAlign: "right",
    marginTop: -spacing.sm,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  skipBtn: {
    flex: 1,
    height: 48,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  skipText: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 15,
    color: colors.neutral.charcoal,
  },
  sendBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: colors.primary.wannaPurple,
    ...shadows.brand,
  },
  sendBtnDisabled: {
    opacity: 0.45,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendText: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 15,
    color: "#FFFFFF",
  },
});
