import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon } from "../../components/Icon";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import type { MyActivityRow } from "../../types/whosin";
import {
  categoryIcons,
  colors,
  spacing,
  borderRadius,
  fontSizes,
  fonts,
} from "../../theme";

export function WhosInListScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [activities, setActivities] = useState<MyActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc(
      "get_my_activities_with_queue_counts",
      { p_user_id: user.id }
    );
    if (error) {
      console.warn("get_my_activities error:", error.message);
      return;
    }
    setActivities((data ?? []) as MyActivityRow[]);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
        </View>
      </SafeAreaView>
    );
  }

  if (activities.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Who's in</Text>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🙌</Text>
          <Text style={styles.emptyTitle}>No active activities</Text>
          <Text style={styles.emptySubtitle}>
            Post an activity from the + tab and people who want to join will
            show up here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Who's in</Text>
      </View>
      <FlatList
        data={activities}
        keyExtractor={(item) => item.activity_id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => (
          <ActivityRow
            row={item}
            onPress={() =>
              navigation.navigate("WhosInQueue", {
                activityId: item.activity_id,
                title: item.title,
                hasActiveMatch: item.has_active_match,
                matchId: item.match_id,
              })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function ActivityRow({
  row,
  onPress,
}: {
  row: MyActivityRow;
  onPress: () => void;
}) {
  const [matchPhoto, setMatchPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (row.matched_user_photo) {
      resolveProfilePhotoUrl(row.matched_user_photo).then(setMatchPhoto);
    }
  }, [row.matched_user_photo]);

  const dimmed = !row.has_active_match && row.pending_count === 0;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, dimmed && styles.rowDimmed]}
    >
      {/* Activity photo thumbnail — replaces the category icon for a
          much faster scan when the user has multiple activities. Falls
          back to the brand-purple Phosphor icon if photo_url is missing
          (shouldn't happen post-migration 00021). */}
      {row.photo_url ? (
        <Image
          source={{ uri: row.photo_url }}
          style={styles.rowThumbnail}
        />
      ) : (
        <View style={styles.rowIconWrapper}>
          <Icon
            name={(categoryIcons[row.category] ?? "Sparkle") as any}
            size={22}
            color={colors.primary.wannaPurple}
            weight="bold"
          />
        </View>
      )}

      <View style={styles.rowMain}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {row.title}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {row.category}
          {row.location_name ? ` · ${row.location_name}` : ""}
        </Text>
      </View>

      <View style={styles.rowRight}>
        {row.has_active_match ? (
          // Matched activities show only a small lock disc — same
          // footprint as the count badge — so the row title gets the
          // remaining horizontal space. The avatar + "Matched" pill
          // were eating ~120pt and truncating most titles.
          <View style={styles.lockBadge}>
            <Icon
              name="Prohibit"
              size={14}
              color={colors.primary.wannaPurple}
              weight="bold"
            />
          </View>
        ) : row.pending_count > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{row.pending_count}</Text>
          </View>
        ) : (
          <Text style={styles.zeroText}>0</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
  },
  listContent: {
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  rowDimmed: {
    opacity: 0.55,
  },
  rowIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral.white,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIcon: {
    fontSize: 24,
  },
  // Activity photo thumbnail (mirrors the activity's hero photo)
  rowThumbnail: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral.cloud,
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.neutral.charcoal,
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
  },
  rowRight: {
    minWidth: 40,
    alignItems: "flex-end",
  },
  countBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    color: colors.neutral.white,
    fontSize: fontSizes.body,
    fontWeight: "700",
  },
  zeroText: {
    color: colors.neutral.slate,
    fontSize: fontSizes.body,
    fontWeight: "600",
  },
  // Same shape + footprint as countBadge so matched and open
  // activities stay visually aligned in the right column. Faint
  // purple tint to signal "locked" rather than "alarming".
  lockBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(140,82,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
  },
});
