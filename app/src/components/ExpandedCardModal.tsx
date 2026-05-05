import React, { useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar } from "./Avatar";
import { CategoryPill } from "./CategoryPill";
import { Icon } from "./Icon";
import { LinkPreview } from "./LinkPreview";
import { ReportSheet } from "./ReportSheet";
import type { FeedCard } from "../types/feed";
import {
  categoryGradients,
  colors,
  spacing,
  borderRadius,
  fontSizes,
  fonts,
  shadows,
} from "../theme";

interface ExpandedCardModalProps {
  card: FeedCard | null;
  onClose: () => void;
  /** Optional callback when the user taps "I'm in" — defaults to no-op
   *  (today the like is dispatched via swipe gestures instead). */
  onIn?: () => void;
  /** Tap on the "Posted by" host card → navigate to the poster's
   *  profile. Modal stays open so user can come back. */
  onHostPress?: () => void;
}

/**
 * Activity Detail screen (mockup screen 2). Rendered as a slide-up sheet
 * from Discover. Layout:
 *   - 380px hero photo with category tag + title overlay + dismiss/share chrome
 *   - 2-col When/Where cards (cloud-grey rounded tiles)
 *   - Description body + link preview card
 *   - "Hosted by" card (secondary, below the activity)
 *   - Sticky bottom CTA bar: dismiss + gradient "I'm in"
 *
 * Unsplash attribution shows here when source='unsplash' (poster credit
 * is required for compliance and is suppressed on the Discover card).
 */
export function ExpandedCardModal({
  card,
  onClose,
  onIn,
  onHostPress,
}: ExpandedCardModalProps) {
  const [reportVisible, setReportVisible] = useState(false);
  if (!card) return null;

  const formattedDate = card.activity_date
    ? new Date(card.activity_date + "T00:00:00")
    : null;
  const dayLabel = formattedDate
    ? formattedDate.toLocaleDateString(undefined, { weekday: "long" })
    : "Anytime";
  // Evergreen activities (no date): show only "Anytime" — no
  // sublabel. Dated activities still get the month-day sublabel.
  const dateSubLabel = formattedDate
    ? formattedDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const distanceLabel =
    card.distance_miles != null
      ? card.distance_miles < 1
        ? "<1 mi away"
        : `${Math.round(card.distance_miles)} mi away`
      : null;

  const fallbackGradient = (categoryGradients[card.category] ?? [
    colors.primary.softViolet,
    colors.primary.wannaPurple,
    colors.secondary.wannaCyan,
  ]) as unknown as readonly [string, string, ...string[]];

  return (
    <Modal
      visible={!!card}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* HERO — 380px activity photo with gradient scrim */}
          <View style={styles.heroWrapper}>
            {card.photo_url ? (
              <Image
                source={{ uri: card.photo_url }}
                style={styles.hero}
                resizeMode="cover"
              />
            ) : (
              <LinearGradient colors={fallbackGradient} style={styles.hero} />
            )}
            {/* Top scrim — keeps chrome visible */}
            <LinearGradient
              colors={["rgba(0,0,0,0.4)", "rgba(0,0,0,0)"]}
              locations={[0, 0.3]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Bottom scrim — keeps title visible */}
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.55)"]}
              locations={[0.65, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Top chrome */}
            <View style={styles.heroChrome}>
              <Pressable style={styles.chromeBtn} onPress={onClose}>
                <Icon
                  name="CaretLeft"
                  size={20}
                  color={colors.neutral.charcoal}
                  weight="bold"
                />
              </Pressable>
              <View style={{ flex: 1 }} />
              {/* Single flag/report icon — share button removed and the
                  three-dots collapsed into this single affordance per
                  user feedback. Tapping opens the report sheet. */}
              <Pressable
                style={styles.chromeBtn}
                onPress={() => setReportVisible(true)}
                hitSlop={6}
              >
                <Icon
                  name="Flag"
                  size={18}
                  color={colors.neutral.charcoal}
                  weight="bold"
                />
              </Pressable>
            </View>

            {/* Bottom block — category + title */}
            <View style={styles.heroBottom}>
              <CategoryPill
                category={card.category}
                variant="light"
                size="lg"
                style={{ marginBottom: 12 }}
              />
              <Text style={styles.heroTitle}>{card.title}</Text>
              {/* Unsplash credit (poster compliance, hidden on Discover) */}
              {card.photo_source === "unsplash" && card.photo_attribution && (
                <Text style={styles.heroCredit}>
                  Photo by {card.photo_attribution.photographer_name} on Unsplash
                </Text>
              )}
            </View>
          </View>

          {/* WHEN / WHERE 2-col card grid */}
          <View style={styles.tileRow}>
            <View style={styles.tile}>
              <View style={styles.tileLabelRow}>
                <Icon
                  name="CalendarBlank"
                  size={13}
                  color={colors.primary.wannaPurple}
                  weight="bold"
                />
                <Text style={styles.tileLabel}>When</Text>
              </View>
              <Text style={styles.tileValue}>{dayLabel}</Text>
              {dateSubLabel ? (
                <Text style={styles.tileSub}>{dateSubLabel}</Text>
              ) : null}
            </View>
            <View style={styles.tile}>
              <View style={styles.tileLabelRow}>
                <Icon
                  name="MapPin"
                  size={13}
                  color={colors.primary.wannaPurple}
                  weight="bold"
                />
                <Text style={styles.tileLabel}>Where</Text>
              </View>
              <Text style={styles.tileValue}>
                {card.location_name ?? "Open"}
              </Text>
              <Text style={styles.tileSub}>{distanceLabel ?? "Anywhere"}</Text>
            </View>
          </View>

          {/* DESCRIPTION + LINK PREVIEW */}
          {(card.description || card.link) && (
            <View style={styles.bodySection}>
              {card.description ? (
                <Text style={styles.body}>{card.description}</Text>
              ) : null}
              {card.link ? (
                <View style={{ marginTop: card.description ? spacing.md : 0 }}>
                  <LinkPreview text={card.link} variant="card" />
                </View>
              ) : null}
            </View>
          )}

          {/* POSTED BY — explicitly secondary; tap navigates to profile */}
          <Pressable
            onPress={onHostPress}
            style={({ pressed }) => [
              styles.hostCard,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.hostLabel}>Posted by</Text>
            <View style={styles.hostRow}>
              <Avatar
                name={card.poster_name}
                uri={card.poster_photo}
                size={48}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.hostNameRow}>
                  <Text style={styles.hostName}>
                    {card.poster_name}, {card.poster_age}
                  </Text>
                  {card.poster_verified && (
                    <Icon
                      name="SealCheck"
                      size={16}
                      color={colors.primary.wannaPurple}
                      weight="fill"
                    />
                  )}
                </View>
                {card.intent !== "friends" && (
                  <Text style={styles.hostMeta}>
                    Looking for {card.intent}
                  </Text>
                )}
              </View>
              <Icon
                name="CaretRight"
                size={16}
                color={colors.neutral.slate}
                weight="bold"
              />
            </View>
          </Pressable>

          {/* Bottom Report link removed — the flag icon in the top-right
              of the hero handles reports now. */}
        </ScrollView>

        {/* Sticky bottom CTA bar */}
        <View style={styles.cta}>
          <Pressable style={styles.ctaPass} onPress={onClose}>
            <Icon
              name="X"
              size={20}
              color={colors.neutral.charcoal}
              weight="bold"
            />
          </Pressable>
          <Pressable
            style={styles.ctaIn}
            onPress={() => {
              if (onIn) onIn();
              onClose();
            }}
          >
            <LinearGradient
              colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ctaInInner}
            >
              <Icon name="HandWaving" size={18} color="#FFFFFF" weight="fill" />
              <Text style={styles.ctaInText}>I'm in</Text>
            </LinearGradient>
          </Pressable>
        </View>

        <ReportSheet
          visible={reportVisible}
          reportedUserId={card.poster_id}
          reportedUserName={card.poster_name}
          reportedContentType="activity"
          reportedContentId={card.activity_id}
          source="discover_expanded"
          onClose={() => setReportVisible(false)}
        />
      </View>
    </Modal>
  );
}

const HERO_HEIGHT = 380;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.white },
  scroll: { paddingBottom: 96 + spacing.lg }, // leave room for sticky CTA

  heroWrapper: {
    height: HERO_HEIGHT,
    position: "relative",
  },
  hero: { width: "100%", height: "100%" },
  heroChrome: {
    position: "absolute",
    top: spacing.md,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chromeBtn: {
    width: 38,
    height: 38,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
    ...shadows.sm,
  },
  heroBottom: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 22,
  },
  heroTitle: {
    fontFamily: fonts.heading,
    color: "#FFFFFF",
    fontSize: 28,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  heroCredit: {
    marginTop: 8,
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "500",
  },

  tileRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingTop: 18,
  },
  tile: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.neutral.cloud,
  },
  tileLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tileLabel: {
    fontSize: 11,
    color: colors.fg.secondary,
    fontFamily: fonts.heading,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tileValue: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.neutral.charcoal,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 4,
  },
  tileSub: {
    fontSize: 13,
    color: colors.fg.secondary,
    fontWeight: "600",
    marginTop: 2,
  },

  bodySection: { paddingHorizontal: spacing.lg, paddingTop: 20 },
  body: {
    fontSize: 15,
    color: colors.neutral.charcoal,
    lineHeight: 22,
  },

  hostCard: {
    margin: spacing.lg,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: "#FFFFFF",
  },
  hostLabel: {
    fontSize: 11,
    color: colors.fg.secondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  hostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  hostNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  hostName: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.neutral.charcoal,
    fontWeight: "700",
  },
  hostMeta: {
    fontSize: 12,
    color: colors.fg.secondary,
    marginTop: 2,
  },

  reportLink: {
    alignItems: "center",
    paddingVertical: 16,
  },
  reportLinkText: {
    fontSize: 12,
    color: colors.neutral.slate,
    fontWeight: "600",
  },

  cta: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 22,
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  ctaPass: {
    width: 48,
    height: 48,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  ctaIn: {
    flex: 1,
    height: 48,
    borderRadius: 9999,
    overflow: "hidden",
    ...shadows.brand,
  },
  ctaInInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaInText: {
    color: "#FFFFFF",
    fontFamily: fonts.heading,
    fontSize: 16,
    fontWeight: "700",
  },
});
