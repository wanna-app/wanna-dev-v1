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
import type { FeedCard } from "../types/feed";
import { resolveProfilePhotoUrl } from "../lib/storage";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";

const CATEGORY_ICONS: Record<string, string> = {
  "Arts & Culture": "🎨",
  "Bars & Nightlife": "🍸",
  "Books & Learning": "📚",
  "Fitness & Sports": "🏋️",
  "Food & Dining": "🍜",
  "Gaming & Tech": "🎮",
  "Movies & Shows": "🎬",
  "Music & Concerts": "🎵",
  "Outdoors & Adventure": "🥾",
  Other: "✨",
};

interface ActivityCardProps {
  card: FeedCard;
  onPress?: () => void;
  style?: ViewStyle;
}

export function ActivityCard({ card, onPress, style }: ActivityCardProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    resolveProfilePhotoUrl(card.poster_photo).then(setPhotoUrl);
  }, [card.poster_photo]);

  const formattedDate = card.activity_date
    ? new Date(card.activity_date + "T00:00:00").toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const distanceLabel =
    card.distance_miles != null
      ? card.distance_miles < 1
        ? "<1 mi"
        : `${Math.round(card.distance_miles)} mi`
      : null;

  return (
    <Pressable style={[styles.card, style]} onPress={onPress}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={StyleSheet.absoluteFill} />
      ) : (
        <LinearGradient
          colors={[colors.primary.softViolet, colors.secondary.wannaCyan]}
          style={StyleSheet.absoluteFill}
        />
      )}

      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        locations={[0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Top badges */}
      <View style={styles.topRow}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryIcon}>
            {CATEGORY_ICONS[card.category] ?? "✨"}
          </Text>
          <Text style={styles.categoryLabel}>{card.category}</Text>
        </View>
        {card.intent !== "friends" && (
          <View
            style={[
              styles.intentBadge,
              card.intent === "dating" && styles.intentDating,
              card.intent === "networking" && styles.intentNetworking,
            ]}
          >
            <Text style={styles.intentText}>
              {card.intent === "dating" ? "Dating" : "Networking"}
            </Text>
          </View>
        )}
      </View>

      {/* Bottom content */}
      <View style={styles.bottomContent}>
        <Text style={styles.title} numberOfLines={2}>
          {card.title}
        </Text>

        <View style={styles.metaRow}>
          {card.location_name ? (
            <Text style={styles.metaText} numberOfLines={1}>
              📍 {card.location_name}
              {distanceLabel ? ` · ${distanceLabel}` : ""}
            </Text>
          ) : distanceLabel ? (
            <Text style={styles.metaText}>{distanceLabel} away</Text>
          ) : null}
        </View>

        {formattedDate && (
          <Text style={styles.metaText}>📅 {formattedDate}</Text>
        )}

        <View style={styles.posterRow}>
          <Text style={styles.posterText}>
            {card.poster_name}, {card.poster_age}
          </Text>
          {card.poster_verified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedCheck}>✓</Text>
            </View>
          )}
        </View>

        {card.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {card.description}
          </Text>
        ) : null}
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
  topRow: {
    position: "absolute",
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  categoryIcon: {
    fontSize: 14,
  },
  categoryLabel: {
    fontSize: fontSizes.caption,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  intentBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary.wannaPurple,
  },
  intentDating: {
    backgroundColor: "#FF4F8B",
  },
  intentNetworking: {
    backgroundColor: colors.secondary.oceanTeal,
  },
  intentText: {
    fontSize: fontSizes.caption,
    fontWeight: "700",
    color: colors.neutral.white,
  },
  bottomContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 28,
    color: colors.neutral.white,
    marginBottom: spacing.sm,
    lineHeight: 32,
  },
  metaRow: {
    marginBottom: spacing.xs,
  },
  metaText: {
    fontSize: fontSizes.body,
    color: colors.neutral.white,
    opacity: 0.92,
    marginBottom: 2,
  },
  posterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  posterText: {
    fontSize: fontSizes.body,
    color: colors.neutral.white,
    fontWeight: "600",
  },
  verifiedBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedCheck: {
    color: colors.neutral.white,
    fontSize: 12,
    fontWeight: "800",
  },
  description: {
    fontSize: fontSizes.caption + 1,
    color: colors.neutral.white,
    opacity: 0.85,
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});
