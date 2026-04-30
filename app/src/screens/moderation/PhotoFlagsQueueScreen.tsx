import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import type {
  ModPhotoFlagRow,
  PhotoDecision,
} from "../../types/moderation";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

export function PhotoFlagsQueueScreen({ navigation }: { navigation: any }) {
  const [flags, setFlags] = useState<ModPhotoFlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchFlags = useCallback(async () => {
    const { data, error } = await supabase.rpc("mod_get_pending_photo_flags", {
      p_limit: 50,
    });
    if (error) {
      Alert.alert("Couldn't load photo flags", error.message);
      return;
    }
    setFlags((data ?? []) as ModPhotoFlagRow[]);
  }, []);

  useEffect(() => {
    fetchFlags().finally(() => setLoading(false));
  }, [fetchFlags]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFlags();
    setRefreshing(false);
  };

  const decide = (flag: ModPhotoFlagRow, decision: PhotoDecision) => {
    Alert.alert(
      decision === "allowed_by_mod" ? "Allow this photo?" : "Reject this photo?",
      decision === "allowed_by_mod"
        ? "It will be restored to the user's profile."
        : "The photo will stay removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: decision === "allowed_by_mod" ? "Allow" : "Reject",
          style: decision === "rejected" ? "destructive" : "default",
          onPress: async () => {
            const { error } = await supabase.rpc("mod_resolve_photo_flag", {
              p_moderation_id: flag.moderation_id,
              p_decision: decision,
            });
            if (error) {
              Alert.alert("Couldn't resolve", error.message);
              return;
            }
            await fetchFlags();
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary.wannaPurple} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Photo flags ({flags.length})</Text>
        <View style={{ width: 60 }} />
      </View>
      <FlatList
        data={flags}
        keyExtractor={(item) => item.moderation_id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No flagged photos.</Text>}
        renderItem={({ item }) => (
          <FlagRow row={item} onAllow={() => decide(item, "allowed_by_mod")} onReject={() => decide(item, "rejected")} />
        )}
      />
    </SafeAreaView>
  );
}

function FlagRow({
  row,
  onAllow,
  onReject,
}: {
  row: ModPhotoFlagRow;
  onAllow: () => void;
  onReject: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    resolveProfilePhotoUrl(row.photo_path).then(setPhotoUrl);
  }, [row.photo_path]);

  return (
    <View style={styles.flagCard}>
      <View style={styles.imageWrap}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <ActivityIndicator color={colors.primary.wannaPurple} />
          </View>
        )}
      </View>
      <View style={{ flex: 1, padding: spacing.md, gap: 4 }}>
        <Text style={styles.userName}>{row.user_first_name}</Text>
        <Text style={styles.categories}>
          {row.flagged_categories?.join(", ") ?? "—"}
        </Text>
        {row.flagged_labels && row.flagged_labels.length > 0 && (
          <Text style={styles.labels} numberOfLines={2}>
            Labels: {row.flagged_labels.slice(0, 4).join(", ")}
          </Text>
        )}
        <View style={styles.likelihoodRow}>
          {row.adult_likelihood && <Text style={styles.likelihood}>adult: {row.adult_likelihood}</Text>}
          {row.violence_likelihood && <Text style={styles.likelihood}>viol: {row.violence_likelihood}</Text>}
          {row.racy_likelihood && <Text style={styles.likelihood}>racy: {row.racy_likelihood}</Text>}
        </View>
        <View style={styles.actions}>
          <Pressable onPress={onAllow} style={[styles.actionBtn, styles.allowBtn]}>
            <Text style={styles.actionText}>Allow</Text>
          </Pressable>
          <Pressable onPress={onReject} style={[styles.actionBtn, styles.rejectBtn]}>
            <Text style={[styles.actionText, { color: colors.neutral.white }]}>Reject</Text>
          </Pressable>
        </View>
      </View>
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
  backText: { fontSize: fontSizes.body, color: colors.primary.wannaPurple, fontWeight: "600", width: 60 },
  headerTitle: { fontFamily: fonts.heading, fontSize: fontSizes.subhead, color: colors.neutral.charcoal },
  listContent: { padding: spacing.md },
  emptyText: { textAlign: "center", padding: spacing.xl, color: colors.neutral.slate },
  flagCard: {
    flexDirection: "row",
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  imageWrap: { width: 120, aspectRatio: 4 / 5 },
  image: { width: "100%", height: "100%" },
  imageFallback: { backgroundColor: colors.neutral.slate, alignItems: "center", justifyContent: "center" },
  userName: { fontSize: fontSizes.body, fontWeight: "700", color: colors.neutral.charcoal },
  categories: { fontSize: fontSizes.caption, color: "#E53E3E", fontWeight: "700", textTransform: "uppercase" },
  labels: { fontSize: fontSizes.caption, color: colors.neutral.slate },
  likelihoodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  likelihood: {
    fontSize: 10,
    color: colors.neutral.slate,
    fontFamily: "Menlo, monospace",
  },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    alignItems: "center",
  },
  allowBtn: { backgroundColor: colors.neutral.white, borderWidth: 1, borderColor: colors.neutral.slate },
  rejectBtn: { backgroundColor: "#E53E3E" },
  actionText: { fontSize: fontSizes.caption, fontWeight: "700", color: colors.neutral.charcoal },
});
