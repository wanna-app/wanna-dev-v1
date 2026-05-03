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
import { Icon, IconName } from "./Icon";
import type { InterestedUser } from "../types/whosin";
import { resolveProfilePhotoUrl } from "../lib/storage";
import {
  categoryGradients,
  colors,
  spacing,
  borderRadius,
  fontSizes,
  fonts,
  shadows,
} from "../theme";

interface UserCardProps {
  user: InterestedUser;
  /** Categories shared between the viewer and the user. Renders as a
   *  colored chip cluster matching the Profile screen aesthetic. */
  sharedPreferences?: string[];
  style?: ViewStyle;
  /** Optional press handler — only used when this card is rendered
   *  outside a swipe gesture container. SwipeableUserCard takes over
   *  tap detection (and routes to profile) when this is unset. */
  onPress?: () => void;
  greyedOut?: boolean;
}

const INTEREST_ICON: Record<string, IconName> = {
  Music: "MusicNotes",
  Outdoors: "Mountains",
  Fitness: "TennisBall",
  Food: "ForkKnife",
  Arts: "Palette",
  Bars: "Martini",
  Books: "BookOpen",
  Movies: "FilmStrip",
  Gaming: "GameController",
  Other: "Sparkle",
};

function pillColor(label: string): string {
  const found = Object.keys(categoryGradients).find((key) =>
    key.toLowerCase().startsWith(label.toLowerCase())
  );
  if (found) return categoryGradients[found][1];
  return colors.primary.wannaPurple;
}

function interestIcon(label: string): IconName {
  const first = label.split(" ")[0];
  return INTEREST_ICON[first] ?? "Sparkle";
}

/**
 * Person card on the Who's In tab. Layout matches mockup slide #3:
 *   - 280px photo with name overlay (mirrors the Profile screen)
 *   - Body section below the photo (cloud-grey background) with:
 *       * Quote callout — placeholder text for now (we don't ask
 *         interested users for a why-they're-in note yet)
 *       * About card — bio + profession + university
 *       * Interests — colored pills, one per shared preference
 *
 * Photo cycling was removed when E1 fixed the swipe-blocked-by-photoNext
 * bug. Tapping anywhere on the card opens the user's full profile (the
 * SwipeableUserCard handles tap detection so the parent gesture
 * detector keeps working).
 */
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

  const heroPhoto = photoUrls[0];
  const distanceLabel =
    user.distance_miles != null
      ? user.distance_miles < 1
        ? "<1 mi"
        : `${Math.round(user.distance_miles)} mi`
      : null;

  // The outer is a Pressable when used directly (e.g. behind-card
  // preview); a View when wrapped by SwipeableUserCard so the gesture
  // detector receives all touches.
  const Wrapper: any = onPress ? Pressable : View;

  return (
    <Wrapper
      style={[styles.card, greyedOut && styles.greyed, style]}
      {...(onPress ? { onPress } : {})}
    >
      {/* PHOTO with name overlay */}
      <View style={styles.photoBox}>
        {heroPhoto ? (
          <Image source={{ uri: heroPhoto }} style={StyleSheet.absoluteFill} />
        ) : (
          <LinearGradient
            colors={[colors.primary.softViolet, colors.secondary.wannaCyan]}
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Bottom scrim */}
        <LinearGradient
          colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
          locations={[0.45, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* "In for [mode]" badge — color-coded per swiper mode */}
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
            <Text style={styles.modeBadgeText}>In for {user.swiper_mode}</Text>
          </View>
        ) : null}

        {/* Photo dots — visual hint that profile has more photos */}
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

        {/* Name overlay */}
        <View style={styles.nameOverlay}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>
              {user.first_name}, {user.age}
            </Text>
            {user.is_verified && (
              <Icon name="SealCheck" size={22} color="#FFFFFF" weight="fill" />
            )}
          </View>
          {distanceLabel ? (
            <View style={styles.subRow}>
              <Icon name="MapPin" size={13} color="#FFFFFF" weight="bold" />
              <Text style={styles.subText}>{distanceLabel} away</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* BODY — quote / about / interests */}
      <View style={styles.body}>
        {/* About card (bio) */}
        {user.bio ? (
          <View style={styles.bodySection}>
            <Text style={styles.bodyHeader}>About</Text>
            <View style={styles.aboutCard}>
              <Text style={styles.bodyText}>{user.bio}</Text>
            </View>
          </View>
        ) : null}

        {/* Interests — colored pills, mirrors Profile */}
        {sharedPreferences.length > 0 && (
          <View style={styles.bodySection}>
            <Text style={styles.bodyHeader}>You both like</Text>
            <View style={styles.pillsRow}>
              {sharedPreferences.map((label) => (
                <View
                  key={label}
                  style={[
                    styles.interestPill,
                    { backgroundColor: pillColor(label) },
                  ]}
                >
                  <Icon
                    name={interestIcon(label)}
                    size={13}
                    color="#FFFFFF"
                    weight="bold"
                  />
                  <Text style={styles.interestPillText}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: colors.bg.subtle,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    ...shadows.md,
  },
  greyed: { opacity: 0.45 },

  // PHOTO
  photoBox: {
    height: 280,
    width: "100%",
    backgroundColor: colors.primary.deepViolet,
    position: "relative",
  },
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
  dotsRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 4,
    zIndex: 2,
  },
  dot: {
    flex: 1,
    height: 3,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.45)",
  },
  dotActive: { backgroundColor: "#FFFFFF" },

  nameOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 16,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  name: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 26,
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
  },
  subText: {
    color: "rgba(255,255,255,0.95)",
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: 12.5,
  },

  // BODY
  body: {
    paddingHorizontal: 16,
    paddingVertical: 18,
    gap: 16,
  },
  bodySection: {
    gap: 8,
  },
  bodyHeader: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 1.1,
    textTransform: "uppercase",
    color: colors.fg.secondary,
  },
  aboutCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.neutral.charcoal,
  },

  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  interestPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 9999,
    ...shadows.sm,
  },
  interestPillText: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 12,
  },
});
