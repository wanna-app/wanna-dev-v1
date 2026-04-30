import React, { useEffect, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import {
  fetchLinkPreview,
  findFirstUrl,
  type LinkPreviewData,
} from "../lib/linkPreview";
import { colors, spacing, borderRadius, fontSizes } from "../theme";

interface LinkPreviewProps {
  text: string | null | undefined;
  variant?: "card" | "compact"; // compact = used inside chat bubbles
  onDarkBackground?: boolean; // adjusts text color in chat bubbles
  style?: ViewStyle;
}

export function LinkPreview({
  text,
  variant = "card",
  onDarkBackground = false,
  style,
}: LinkPreviewProps) {
  const url = findFirstUrl(text);
  const [data, setData] = useState<LinkPreviewData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!url) {
      setData(null);
      return;
    }
    let mounted = true;
    setLoading(true);
    fetchLinkPreview(url)
      .then((d) => mounted && setData(d))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [url]);

  if (!url) return null;

  const open = () => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  };

  // Compact: used inside chat bubbles. Falls back to a plain tappable URL
  // until metadata loads or if the fetch fails.
  if (variant === "compact") {
    if (!data || (!data.title && !data.description && !data.image)) {
      return (
        <Pressable onPress={open}>
          <Text
            style={[
              styles.fallbackUrl,
              onDarkBackground && styles.fallbackUrlOnDark,
              style,
            ]}
          >
            {url}
          </Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={open}
        style={[
          styles.compactCard,
          onDarkBackground && styles.compactCardOnDark,
          style,
        ]}
      >
        {data.image && (
          <Image source={{ uri: data.image }} style={styles.compactImage} />
        )}
        <View style={styles.compactContent}>
          <Text
            style={[
              styles.compactDomain,
              onDarkBackground && styles.compactDomainOnDark,
            ]}
            numberOfLines={1}
          >
            {data.domain}
          </Text>
          {data.title && (
            <Text
              style={[
                styles.compactTitle,
                onDarkBackground && styles.compactTitleOnDark,
              ]}
              numberOfLines={2}
            >
              {data.title}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }

  // Card variant: used on activity cards (Discover expanded, etc.)
  if (loading || !data || (!data.title && !data.description && !data.image)) {
    return null;
  }
  return (
    <Pressable onPress={open} style={[styles.card, style]}>
      {data.image && (
        <Image source={{ uri: data.image }} style={styles.cardImage} />
      )}
      <View style={styles.cardContent}>
        <Text style={styles.cardDomain} numberOfLines={1}>
          {data.domain}
        </Text>
        {data.title && (
          <Text style={styles.cardTitle} numberOfLines={2}>
            {data.title}
          </Text>
        )}
        {data.description && (
          <Text style={styles.cardDescription} numberOfLines={2}>
            {data.description}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    flexDirection: "row",
  },
  cardImage: {
    width: 80,
    height: 80,
  },
  cardContent: {
    flex: 1,
    padding: spacing.sm,
  },
  cardDomain: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.neutral.charcoal,
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    lineHeight: 16,
  },
  compactCard: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
    borderLeftWidth: 3,
    borderLeftColor: colors.primary.wannaPurple,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: 6,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: "center",
  },
  compactCardOnDark: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderLeftColor: colors.primary.lavenderMist,
  },
  compactImage: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  compactContent: { flex: 1 },
  compactDomain: {
    fontSize: 11,
    color: colors.neutral.slate,
    marginBottom: 2,
  },
  compactDomainOnDark: { color: "rgba(255,255,255,0.85)" },
  compactTitle: {
    fontSize: fontSizes.caption + 1,
    fontWeight: "600",
    color: colors.neutral.charcoal,
  },
  compactTitleOnDark: { color: colors.neutral.white },
  fallbackUrl: {
    fontSize: fontSizes.caption,
    color: colors.primary.wannaPurple,
    textDecorationLine: "underline",
    marginTop: 4,
  },
  fallbackUrlOnDark: {
    color: colors.primary.lavenderMist,
  },
});
