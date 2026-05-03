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
  /** Optional press handler — only used when this card is rendered
   *  outside a swipe gesture container. SwipeableUserCard takes over
   *  tap detection (and routes to profile) when this is unset. */
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

  // First photo is the hero. Multi-photo cycling is removed because the
  // dedicated Pressable was intercepting horizontal swipes on the right
  // half of the card (made the swipe-to-accept gesture feel broken in
  // Who's In). Users can see additional photos on the full profile.
  const currentPhoto = photoUrls[0];

  // Optional Pressable wrapper — only when an onPress is passed. When
  // SwipeableUserCard wraps this, it owns the tap gesture and we render
  // a plain View so the parent gesture detector receives all touches.
  const Wrapper: any = onPress ? Pressable : View;

  return (
    <Wrapper
      style={[styles.card, greyedOut && styles.greyed, style]}
      {...(onPress ? { onPress } : {})}
    >
      {currentPhoto ? (
        <Image source={{ uri: currentPhoto }} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={[colors.primary.softViolet, colors.secondary.wannaCyan]}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Photo dots indicating that more photos exist on profile */}
      {photoUrls.length > 1 && (
        <View style={styles.dotsRow}>
          {photoUrls.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === 0 && styles.dotActive]}
            />
          ))}
        </View>
      )}

      {/* "They're in for [mode]" badge — shows the poster which mode the
          swiper was in when they liked the activity. Hidden for legacy
          rows where swiper_mode is null. */}
      {user.swiper_mode ? (
        <View
          style={[
            styles.modeBadge,
            {
              backgroundColor:
                user.swiper_mode === "friends"
                  ? "#8C52FF"
                  : user.swiper_mode === "dating"
                  ? "#FF5C7A"
                  : "#1E90FF",
            },
          ]}
        >
          <Text style={styles.modeBadgeText}>
            In for {user.swiper_mode}
          </Text>
        </View>
      ) : null}

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
    </Wrapper>
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
  // Swiper-mode badge — color-coded per mode (matches ModePicker)
  modeBadge: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9999,
    zIndex: 2,
  },
  modeBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
    fontFamily: fonts.heading,
    textTransform: "capitalize",
  },
});
