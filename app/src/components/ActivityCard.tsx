import React from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar } from "./Avatar";
import { CategoryPill } from "./CategoryPill";
import { Icon } from "./Icon";
import type { FeedCard } from "../types/feed";
import {
  categoryGradients,
  colors,
  spacing,
  borderRadius,
  fontSizes,
  fonts,
} from "../theme";

interface ActivityCardProps {
  card: FeedCard;
  /** Tap on the body opens the detail sheet. */
  onPress?: () => void;
  /** Tap on the host strip opens the host's profile. */
  onHostPress?: () => void;
  style?: ViewStyle;
}

/**
 * Full-bleed Discover card (mockup 1b). The activity photo fills the entire
 * card; a bottom gradient scrim keeps the title legible. Activity is the
 * hero — the host strip at the bottom is a small tappable pill.
 *
 * No Unsplash credit is shown here per product spec — credit appears on
 * the Activity Detail screen instead.
 */
export function ActivityCard({
  card,
  onPress,
  onHostPress,
  style,
}: ActivityCardProps) {
  const formattedDate = card.activity_date
    ? new Date(card.activity_date + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "short",
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

  // Per-category gradient fallback when photo is missing (defensive — schema
  // requires it post-migration 00021).
  const fallbackGradient = (categoryGradients[card.category] ?? [
    colors.primary.softViolet,
    colors.primary.wannaPurple,
    colors.secondary.wannaCyan,
  ]) as unknown as readonly [string, string, ...string[]];

  return (
    <Pressable style={[styles.card, style]} onPress={onPress}>
      {/* Photo layer */}
      {card.photo_url ? (
        <Image
          source={{ uri: card.photo_url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={fallbackGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Top scrim — keeps the dating/networking pill legible if rendered */}
      <LinearGradient
        colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
        locations={[0, 0.22]}
        style={[StyleSheet.absoluteFill, styles.topScrim]}
      />

      {/* Bottom scrim — heavy at the very bottom so title + meta are legible */}
      <LinearGradient
        colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.85)"]}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Top right: intent pill (Friends/Dating/Networking) — only shown if
          non-default. Position lets the parent's mode-switcher pill sit
          alongside it without colliding. */}
      {card.intent !== "friends" && (
        <View style={styles.intentPill}>
          <Text style={styles.intentText}>
            {card.intent === "dating" ? "Dating" : "Networking"}
          </Text>
        </View>
      )}

      {/* Bottom info column */}
      <View style={styles.bottom}>
        {/* Category pill above title (mockup pattern) */}
        <CategoryPill
          category={card.category}
          variant="light"
          size="md"
          style={{ marginBottom: spacing.sm }}
        />

        {/* Big balanced title */}
        <Text style={styles.title} numberOfLines={3}>
          {card.title}
        </Text>

        {/* When + Where row */}
        <View style={styles.metaRow}>
          {formattedDate ? (
            <View style={styles.metaItem}>
              <Icon
                name="CalendarBlank"
                size={14}
                color="rgba(255,255,255,0.92)"
                weight="bold"
              />
              <Text style={styles.metaText}>{formattedDate}</Text>
            </View>
          ) : null}
          {(card.location_name || distanceLabel) && (
            <View style={styles.metaItem}>
              <Icon
                name="MapPin"
                size={14}
                color="rgba(255,255,255,0.92)"
                weight="bold"
              />
              <Text style={styles.metaText} numberOfLines={1}>
                {card.location_name ?? "Nearby"}
                {distanceLabel ? ` · ${distanceLabel}` : ""}
              </Text>
            </View>
          )}
        </View>

        {/* Description preview */}
        {card.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {card.description}
          </Text>
        ) : null}

        {/* Host strip — translucent pill, secondary to the activity */}
        <Pressable
          onPress={onHostPress}
          hitSlop={6}
          style={({ pressed }) => [
            styles.hostStrip,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Avatar
            name={card.poster_name}
            uri={card.poster_photo}
            size={28}
          />
          <View style={styles.hostNameRow}>
            <Text style={styles.hostName}>
              {card.poster_name}, {card.poster_age}
            </Text>
            {card.poster_verified && (
              <Icon name="SealCheck" size={12} color="#fff" weight="fill" />
            )}
          </View>
          <Text style={styles.hostHint}>Tap to see profile</Text>
          <Icon
            name="CaretRight"
            size={14}
            color="rgba(255,255,255,0.85)"
            weight="bold"
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    backgroundColor: colors.neutral.charcoal,
  },
  topScrim: { /* placeholder, structure only */ },
  intentPill: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    backgroundColor: "#FF5C7A",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  intentText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: fonts.heading,
  },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
  },
  title: {
    fontFamily: fonts.heading,
    color: "#FFFFFF",
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.6,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  metaText: {
    color: "rgba(255,255,255,0.92)",
    fontSize: 13,
    fontWeight: "600",
    fontFamily: fonts.heading,
  },
  description: {
    marginTop: 10,
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    lineHeight: 20,
  },
  hostStrip: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  hostNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  hostName: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: fonts.heading,
  },
  hostHint: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: fonts.heading,
    marginLeft: "auto",
  },
});
