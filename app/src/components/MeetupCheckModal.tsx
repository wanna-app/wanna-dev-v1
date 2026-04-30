import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Button } from "./Button";
import { resolveProfilePhotoUrl } from "../lib/storage";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";

export interface PendingMeetupCheck {
  meetup_check_id: string;
  match_id: string;
  activity_id: string;
  activity_title: string;
  other_user_id: string;
  other_user_name: string;
  other_user_photo: string | null;
  trigger_type: "date_passed" | "timer_72h" | "chat_opened";
  dismiss_count: number;
}

interface Props {
  check: PendingMeetupCheck | null;
  onYes: () => void;
  onNotYet: () => void;
  onDismiss: () => void;
}

export function MeetupCheckModal({ check, onYes, onNotYet, onDismiss }: Props) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!check?.other_user_photo) {
      setPhotoUrl(null);
      return;
    }
    resolveProfilePhotoUrl(check.other_user_photo).then(setPhotoUrl);
  }, [check?.other_user_photo]);

  if (!check) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.photoFrame}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoFallback]}>
                <Text style={styles.photoInitial}>
                  {check.other_user_name.charAt(0)}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>Did you meet up?</Text>
          <Text style={styles.body}>
            You matched with{" "}
            <Text style={styles.bodyBold}>{check.other_user_name}</Text> for{" "}
            <Text style={styles.bodyBold}>“{check.activity_title}”</Text>. Did
            you two get together?
          </Text>

          <View style={styles.actions}>
            <Button label="Yes, we met! 🎉" variant="gradient" onPress={onYes} />
            <Button
              label="Not yet"
              variant="ghost"
              onPress={onNotYet}
              style={{ marginTop: spacing.xs }}
            />
          </View>
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
  photoFrame: {
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    marginBottom: spacing.md,
    borderWidth: 3,
    borderColor: colors.primary.lavenderMist,
  },
  photo: { width: "100%", height: "100%" },
  photoFallback: {
    backgroundColor: colors.primary.lavenderMist,
    alignItems: "center",
    justifyContent: "center",
  },
  photoInitial: {
    fontFamily: fonts.heading,
    fontSize: 36,
    color: colors.primary.royalPurple,
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
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  bodyBold: { fontWeight: "700" },
  actions: { width: "100%" },
});
