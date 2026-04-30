import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { FeedCard } from "../types/feed";
import { resolveProfilePhotoUrl } from "../lib/storage";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";

interface ExpandedCardModalProps {
  card: FeedCard | null;
  onClose: () => void;
}

export function ExpandedCardModal({ card, onClose }: ExpandedCardModalProps) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!card) return;
    resolveProfilePhotoUrl(card.poster_photo).then(setPhotoUrl);
  }, [card?.poster_photo]);

  if (!card) return null;

  const formattedDate = card.activity_date
    ? new Date(card.activity_date + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })
    : "Anytime";

  return (
    <Modal
      visible={!!card}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.heroWrapper}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.hero} />
          ) : (
            <LinearGradient
              colors={[colors.primary.softViolet, colors.secondary.wannaCyan]}
              style={styles.hero}
            />
          )}
          <Pressable style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.posterRow}>
            <Text style={styles.posterName}>
              {card.poster_name}, {card.poster_age}
            </Text>
            {card.poster_verified && (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedCheck}>✓</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>{card.title}</Text>

          <View style={styles.metaSection}>
            <View style={styles.metaRow}>
              <Text style={styles.metaIcon}>🏷️</Text>
              <Text style={styles.metaText}>{card.category}</Text>
            </View>
            {card.intent !== "friends" && (
              <View style={styles.metaRow}>
                <Text style={styles.metaIcon}>💭</Text>
                <Text style={styles.metaText}>
                  {card.intent === "dating" ? "Dating" : "Networking"}
                </Text>
              </View>
            )}
            {card.location_name && (
              <View style={styles.metaRow}>
                <Text style={styles.metaIcon}>📍</Text>
                <Text style={styles.metaText}>
                  {card.location_name}
                  {card.distance_miles != null
                    ? ` · ${Math.max(1, Math.round(card.distance_miles))} mi`
                    : ""}
                </Text>
              </View>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.metaIcon}>📅</Text>
              <Text style={styles.metaText}>{formattedDate}</Text>
            </View>
          </View>

          {card.description ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>About this</Text>
              <Text style={styles.description}>{card.description}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  heroWrapper: {
    height: 320,
    position: "relative",
  },
  hero: {
    width: "100%",
    height: "100%",
  },
  closeButton: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeIcon: {
    color: colors.neutral.white,
    fontSize: 18,
    fontWeight: "700",
  },
  scroll: {
    padding: spacing.lg,
  },
  posterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  posterName: {
    fontSize: fontSizes.subhead,
    fontWeight: "600",
    color: colors.neutral.charcoal,
  },
  verifiedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedCheck: {
    color: colors.neutral.white,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.display,
    color: colors.neutral.charcoal,
    marginBottom: spacing.lg,
  },
  metaSection: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  metaIcon: {
    fontSize: fontSizes.body,
    width: 24,
  },
  metaText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    flex: 1,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  description: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    lineHeight: 24,
  },
});
