import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useModeratorStatus } from "../../hooks/useModeratorStatus";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

export function ModerationHomeScreen({ navigation }: { navigation: any }) {
  const { counts } = useModeratorStatus();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Moderation</Text>
        <Text style={styles.headerSubtitle}>
          Internal triage queue. Visible only to users with{" "}
          <Text style={styles.mono}>is_moderator = true</Text>.
        </Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <QueueCard
          title="Reports"
          count={counts.reports}
          description="User reports awaiting decision"
          onPress={() => navigation.navigate("ReportsQueue")}
        />
        <QueueCard
          title="Photo flags"
          count={counts.photo_flags}
          description="Auto-flagged by Vision SafeSearch"
          onPress={() => navigation.navigate("PhotoFlagsQueue")}
        />
        <QueueCard
          title="Verifications"
          count={counts.verifications}
          description="Selfies awaiting approval"
          onPress={() => navigation.navigate("VerificationsQueue")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function QueueCard({
  title,
  count,
  description,
  onPress,
}: {
  title: string;
  count: number;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDescription}>{description}</Text>
      </View>
      <View style={[styles.countBadge, count === 0 && styles.countBadgeMuted]}>
        <Text
          style={[
            styles.countText,
            count === 0 && styles.countTextMuted,
          ]}
        >
          {count}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.cloud },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.neutral.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
  },
  headerSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginTop: 4,
  },
  mono: { fontFamily: "Menlo, monospace" },
  scroll: { padding: spacing.lg, gap: spacing.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  cardLeft: { flex: 1 },
  cardTitle: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  cardDescription: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginTop: 2,
  },
  countBadge: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeMuted: {
    backgroundColor: colors.neutral.cloud,
  },
  countText: {
    color: colors.neutral.white,
    fontSize: fontSizes.body,
    fontWeight: "700",
  },
  countTextMuted: {
    color: colors.neutral.slate,
  },
  chevron: {
    fontSize: 22,
    color: colors.neutral.slate,
  },
});
