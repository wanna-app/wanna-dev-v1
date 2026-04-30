import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { InterestedUser } from "../types/whosin";
import { resolveProfilePhotoUrl } from "../lib/storage";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";

interface UserCardProps {
  user: InterestedUser;
  sharedPreferences?: string[];
  style?: ViewStyle;
  onPress?: () => void;
  greyedOut?: boolean;
}

export function UserCard({
  user,
  sharedPreferences = [],
  style,
  onPress,
  greyedOut,
}: UserCardProps) {
  const [photoUrls, setPhotoUrls] = useState<(string | null)[]>([]);
  const [photoIndex, setPhotoIndex] = useState(0);

  useEffect(() => {
    Promise.all(user.photos.slice(0, 3).map(resolveProfilePhotoUrl)).then(
      setPhotoUrls
    );
  }, [user.photos]);

  const distanceLabel =
    user.distance_miles != null
      ? user.distance_miles < 1
        ? "<1 mi"
        : `${Math.round(user.distance_miles)} mi`
      : null;

  const cyclePhoto = (e: any) => {
    e.stopPropagation?.();
    setPhotoIndex((i) => (i + 1) % Math.max(1, photoUrls.length));
  };

  const currentPhoto = photoUrls[photoIndex];

  return (
    <Pressable
      style={[styles.card, greyedOut && styles.greyed, style]}
      onPress={onPress}
    >
      {currentPhoto ? (
        <Image source={{ uri: currentPhoto }} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={[colors.primary.softViolet, colors.secondary.wannaCyan]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Photo dots */}
      {photoUrls.length > 1 && (
        <View style={styles.dotsRow}>
          {photoUrls.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === photoIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>
      )}

      {/* Tap zone for cycling photos */}
      <Pressable style={styles.photoNext} onPress={cyclePhoto} />

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        locations={[0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.content} pointerEvents="none">
        <View style={styles.nameRow}>
          <Text style={styles.name}>
            {user.first_name}, {user.age}
          </Text>
          {user.is_verified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedCheck}>✓</Text>
            </View>
          )}
          {distanceLabel && (
            <Text style={styles.distance}>· {distanceLabel}</Text>
          )}
        </View>

        {user.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {user.bio}
          </Text>
        ) : null}

        {sharedPreferences.length > 0 && (
          <View style={styles.sharedRow}>
            <Text style={styles.sharedLabel}>Both into:</Text>
            <Text style={styles.sharedText} numberOfLines={1}>
              {sharedPreferences.slice(0, 3).join(" · ")}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: colors.neutral.cloud,
  },
  greyed: {
    opacity: 0.45,
  },
  dotsRow: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    gap: 4,
    zIndex: 2,
  },
  dot: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  dotActive: {
    backgroundColor: colors.neutral.white,
  },
  photoNext: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "50%",
    height: "60%",
    zIndex: 1,
  },
  content: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  name: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.neutral.white,
  },
  verifiedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedCheck: {
    color: colors.neutral.white,
    fontSize: 13,
    fontWeight: "800",
  },
  distance: {
    fontSize: fontSizes.body,
    color: colors.neutral.white,
    opacity: 0.85,
  },
  bio: {
    fontSize: fontSizes.body,
    color: colors.neutral.white,
    opacity: 0.92,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  sharedRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  sharedLabel: {
    fontSize: fontSizes.caption,
    fontWeight: "700",
    color: colors.primary.lavenderMist,
  },
  sharedText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.white,
    opacity: 0.9,
    flex: 1,
  },
});
