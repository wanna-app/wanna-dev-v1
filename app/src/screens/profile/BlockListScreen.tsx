import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import { track } from "../../lib/analytics";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

interface BlockedRow {
  block_id: string;
  blocked_user_id: string;
  blocked_at: string;
  first_name: string;
  photo: string | null;
}

export function BlockListScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<BlockedRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlocks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("blocks")
      .select(
        "id, blocked_user_id, created_at, profiles:blocked_user_id (first_name, photos)"
      )
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("blocks fetch error:", error.message);
      return;
    }
    setBlocks(
      (data ?? []).map((b: any) => ({
        block_id: b.id,
        blocked_user_id: b.blocked_user_id,
        blocked_at: b.created_at,
        first_name: b.profiles?.first_name ?? "Unknown",
        photo: b.profiles?.photos?.[0] ?? null,
      }))
    );
  }, [user]);

  useEffect(() => {
    fetchBlocks().finally(() => setLoading(false));
  }, [fetchBlocks]);

  const unblock = (block: BlockedRow) => {
    Alert.alert(
      "Unblock?",
      `${block.first_name} may show up in your feed again. Existing matches won't be restored.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            const { error } = await supabase
              .from("blocks")
              .delete()
              .eq("id", block.block_id);
            if (error) {
              Alert.alert("Couldn't unblock", error.message);
              return;
            }
            track("user_unblocked", {
              unblocked_user_id: block.blocked_user_id,
              block_duration_hours: Math.floor(
                (Date.now() - new Date(block.blocked_at).getTime()) /
                  (1000 * 60 * 60)
              ),
            });
            await fetchBlocks();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Blocked users</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
        </View>
      ) : blocks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No blocked users.</Text>
        </View>
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={(item) => item.block_id}
          contentContainerStyle={{ padding: spacing.md }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => <BlockRow row={item} onUnblock={unblock} />}
        />
      )}
    </SafeAreaView>
  );
}

function BlockRow({
  row,
  onUnblock,
}: {
  row: BlockedRow;
  onUnblock: (row: BlockedRow) => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    resolveProfilePhotoUrl(row.photo).then(setPhotoUrl);
  }, [row.photo]);

  return (
    <View style={styles.row}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{row.first_name.charAt(0)}</Text>
        </View>
      )}
      <Text style={styles.name}>{row.first_name}</Text>
      <Pressable style={styles.unblockBtn} onPress={() => onUnblock(row)}>
        <Text style={styles.unblockText}>Unblock</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  backText: {
    fontSize: fontSizes.body,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
    width: 60,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.charcoal,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: fontSizes.body, color: colors.neutral.slate },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    backgroundColor: colors.primary.lavenderMist,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.primary.royalPurple,
  },
  name: {
    flex: 1,
    fontSize: fontSizes.body,
    fontWeight: "600",
    color: colors.neutral.charcoal,
  },
  unblockBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary.wannaPurple,
    borderRadius: borderRadius.full,
  },
  unblockText: {
    color: colors.neutral.white,
    fontSize: fontSizes.caption,
    fontWeight: "700",
  },
});
