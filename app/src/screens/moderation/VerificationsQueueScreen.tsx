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
import type { ModVerificationRow } from "../../types/moderation";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

const VERIFICATION_BUCKET = "verification-selfies";

async function resolveVerificationUrl(path: string): Promise<string | null> {
  if (path.startsWith("http")) return path;
  const { data, error } = await supabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) {
    console.warn("verification signed URL error:", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export function VerificationsQueueScreen({ navigation }: { navigation: any }) {
  const [rows, setRows] = useState<ModVerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchRows = useCallback(async () => {
    const { data, error } = await supabase.rpc("mod_get_pending_verifications", {
      p_limit: 50,
    });
    if (error) {
      Alert.alert("Couldn't load verifications", error.message);
      return;
    }
    setRows((data ?? []) as ModVerificationRow[]);
  }, []);

  useEffect(() => {
    fetchRows().finally(() => setLoading(false));
  }, [fetchRows]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRows();
    setRefreshing(false);
  };

  const decide = (row: ModVerificationRow, approve: boolean) => {
    Alert.alert(
      approve ? `Approve ${row.first_name}?` : `Reject ${row.first_name}?`,
      approve
        ? "User will see the verified badge across the app."
        : "User's verification photo will be cleared and they'll be prompted to retake.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: approve ? "Approve" : "Reject",
          style: approve ? "default" : "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("mod_resolve_verification", {
              p_user_id: row.user_id,
              p_approve: approve,
            });
            if (error) {
              Alert.alert("Couldn't resolve", error.message);
              return;
            }
            await fetchRows();
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
        <Text style={styles.headerTitle}>Verifications ({rows.length})</Text>
        <View style={{ width: 60 }} />
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No pending verifications.</Text>}
        renderItem={({ item }) => (
          <VerificationRow
            row={item}
            onApprove={() => decide(item, true)}
            onReject={() => decide(item, false)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function VerificationRow({
  row,
  onApprove,
  onReject,
}: {
  row: ModVerificationRow;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [profilePhotoUrl, setProfilePhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    resolveVerificationUrl(row.verification_photo_url).then(setSelfieUrl);
    if (row.photos?.[0]) {
      resolveProfilePhotoUrl(row.photos[0]).then(setProfilePhotoUrl);
    }
  }, [row.verification_photo_url, row.photos]);

  return (
    <View style={styles.card}>
      <Text style={styles.userName}>{row.first_name}</Text>
      <View style={styles.imagePair}>
        <View style={styles.imageBox}>
          <Text style={styles.imageLabel}>Selfie</Text>
          {selfieUrl ? (
            <Image source={{ uri: selfieUrl }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <ActivityIndicator color={colors.primary.wannaPurple} />
            </View>
          )}
        </View>
        <View style={styles.imageBox}>
          <Text style={styles.imageLabel}>Primary photo</Text>
          {profilePhotoUrl ? (
            <Image source={{ uri: profilePhotoUrl }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <ActivityIndicator color={colors.primary.wannaPurple} />
            </View>
          )}
        </View>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onReject} style={[styles.actionBtn, styles.rejectBtn]}>
          <Text style={[styles.actionText, { color: colors.neutral.white }]}>Reject</Text>
        </Pressable>
        <Pressable onPress={onApprove} style={[styles.actionBtn, styles.approveBtn]}>
          <Text style={[styles.actionText, { color: colors.neutral.white }]}>Approve ✓</Text>
        </Pressable>
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
  card: { backgroundColor: colors.neutral.cloud, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  userName: { fontSize: fontSizes.body, fontWeight: "700", color: colors.neutral.charcoal },
  imagePair: { flexDirection: "row", gap: spacing.sm },
  imageBox: { flex: 1 },
  imageLabel: { fontSize: 10, color: colors.neutral.slate, marginBottom: 4, textTransform: "uppercase", fontWeight: "700" },
  image: { width: "100%", aspectRatio: 4 / 5, borderRadius: borderRadius.md },
  imageFallback: { backgroundColor: colors.neutral.white, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, alignItems: "center" },
  approveBtn: { backgroundColor: colors.primary.wannaPurple },
  rejectBtn: { backgroundColor: "#E53E3E" },
  actionText: { fontSize: fontSizes.body, fontWeight: "700" },
});
