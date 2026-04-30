import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "./Button";
import { resolveProfilePhotoUrl } from "../lib/storage";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";

interface MatchModalProps {
  visible: boolean;
  matchedName: string;
  matchedPhoto: string | null;
  activityTitle: string;
  onSayHi: () => void;
  onKeepBrowsing: () => void;
}

export function MatchModal({
  visible,
  matchedName,
  matchedPhoto,
  activityTitle,
  onSayHi,
  onKeepBrowsing,
}: MatchModalProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    resolveProfilePhotoUrl(matchedPhoto).then(setPhotoUrl);
  }, [matchedPhoto]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <LinearGradient
        colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        <View style={styles.content}>
          <Text style={styles.eyebrow}>It's a match!</Text>
          <Text style={styles.title}>You and {matchedName}{"\n"}are in.</Text>

          <View style={styles.photoFrame}>
            {photoUrl ? (
              <Image source={{ uri: photoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoFallback]}>
                <Text style={styles.photoInitial}>{matchedName.charAt(0)}</Text>
              </View>
            )}
          </View>

          <Text style={styles.activityLabel}>For:</Text>
          <Text style={styles.activityTitle} numberOfLines={2}>
            {activityTitle}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable onPress={onSayHi} style={styles.sayHiButton}>
            <Text style={styles.sayHiText}>Say hi 👋</Text>
          </Pressable>
          <Pressable onPress={onKeepBrowsing} style={styles.keepBrowsingButton}>
            <Text style={styles.keepBrowsingText}>Keep browsing</Text>
          </Pressable>
        </View>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.lg,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.white,
    opacity: 0.9,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 40,
    color: colors.neutral.white,
    textAlign: "center",
    marginBottom: spacing.xl,
    lineHeight: 46,
  },
  photoFrame: {
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 4,
    borderColor: colors.neutral.white,
    overflow: "hidden",
    marginBottom: spacing.xl,
    shadowColor: colors.neutral.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  photo: {
    width: "100%",
    height: "100%",
  },
  photoFallback: {
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoInitial: {
    fontFamily: fonts.heading,
    fontSize: 80,
    color: colors.neutral.white,
  },
  activityLabel: {
    fontSize: fontSizes.caption,
    color: colors.neutral.white,
    opacity: 0.85,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  activityTitle: {
    fontSize: fontSizes.subhead,
    color: colors.neutral.white,
    fontWeight: "700",
    textAlign: "center",
    paddingHorizontal: spacing.lg,
  },
  actions: {
    width: "100%",
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  sayHiButton: {
    height: 56,
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  sayHiText: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.primary.wannaPurple,
  },
  keepBrowsingButton: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  keepBrowsingText: {
    fontSize: fontSizes.body,
    fontWeight: "600",
    color: colors.neutral.white,
  },
});
