import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { useAuth } from "../hooks/useAuth";
import { colors, fonts, fontSizes, spacing, borderRadius } from "../theme";

// AsyncStorage key marks "user has seen the pre-prompt at least once."
// Kept separate from the system-level permission status so we don't
// hammer users who've explicitly declined.
const STORAGE_KEY = "wanna:push:pre_prompt_seen";

/**
 * The "explain notifications BEFORE asking" modal. Best-practice for
 * push opt-in: users who say yes to a clear "want a heads-up when
 * someone's interested?" pre-prompt say yes ~3x more often than users
 * who get hit with iOS's bare-system dialog cold.
 *
 * Logic:
 *   - Show only after the user is signed in AND has a profile loaded
 *     AND we haven't shown it before AND permissions haven't been
 *     answered yet (so we don't re-prompt after a decline).
 *   - On "Sure" → call Notifications.requestPermissionsAsync(). If
 *     granted, usePushRegistration's next render picks up + writes
 *     device_tokens.
 *   - On "Not now" → mark seen, never show again. User can flip it
 *     manually via iOS Settings if they change their mind.
 */
export function PushPrePromptModal() {
  const { user, profile } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;
    if (!Device.isDevice) return; // simulators can't receive APNs
    let cancelled = false;
    (async () => {
      const seen = await AsyncStorage.getItem(STORAGE_KEY);
      if (seen) return;
      const perm = await Notifications.getPermissionsAsync();
      // If the user already granted (e.g. on a previous device) or
      // explicitly denied + can't ask again, the system has the final
      // say and we have nothing to add.
      if (perm.granted || !perm.canAskAgain) {
        await AsyncStorage.setItem(STORAGE_KEY, "1");
        return;
      }
      if (!cancelled) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, profile]);

  const accept = async () => {
    await Notifications.requestPermissionsAsync();
    await AsyncStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  const decline = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🔔</Text>
          <Text style={styles.title}>Stay in the loop</Text>
          <Text style={styles.body}>
            We'll ping you when:
            {"\n"}• Someone's interested in your activity
            {"\n"}• You've got a new match
            {"\n"}• A match messages you
            {"\n"}{"\n"}You can fine-tune which types in Settings anytime.
          </Text>
          <Pressable
            style={({ pressed }) => [
              styles.acceptBtn,
              pressed && { opacity: 0.85 },
            ]}
            onPress={accept}
          >
            <Text style={styles.acceptText}>Sure, send me updates</Text>
          </Pressable>
          <Pressable onPress={decline}>
            <Text style={styles.declineText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
  },
  emoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  body: {
    fontFamily: fonts.body,
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "left",
    lineHeight: 22,
    marginBottom: spacing.xl,
    alignSelf: "stretch",
  },
  acceptBtn: {
    backgroundColor: colors.primary.wannaPurple,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.full,
    marginBottom: spacing.md,
    alignSelf: "stretch",
    alignItems: "center",
  },
  acceptText: {
    fontFamily: fonts.body,
    fontSize: 17,
    fontWeight: "500",
    color: colors.neutral.white,
  },
  declineText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.neutral.slate,
    paddingVertical: spacing.sm,
  },
});
