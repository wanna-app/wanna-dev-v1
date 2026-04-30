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
import type { ModReportRow, ReportResolution } from "../../types/moderation";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

const RESOLUTION_OPTIONS: { value: ReportResolution; label: string; destructive?: boolean }[] = [
  { value: "no_action", label: "No action" },
  { value: "warning", label: "Warn user" },
  { value: "content_removed", label: "Remove content" },
  { value: "temp_ban", label: "Temp ban (deactivates)", destructive: true },
  { value: "permanent_ban", label: "Permanent ban (deactivates)", destructive: true },
];

export function ReportsQueueScreen({ navigation }: { navigation: any }) {
  const [reports, setReports] = useState<ModReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase.rpc("mod_get_pending_reports", {
      p_limit: 50,
    });
    if (error) {
      Alert.alert("Couldn't load reports", error.message);
      return;
    }
    setReports((data ?? []) as ModReportRow[]);
  }, []);

  useEffect(() => {
    fetchReports().finally(() => setLoading(false));
  }, [fetchReports]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReports();
    setRefreshing(false);
  };

  const resolve = (report: ModReportRow) => {
    Alert.alert(
      `Resolve report against ${report.reported_user_name}`,
      `Reason: ${report.reason}${report.description ? `\n\nDetails: ${report.description}` : ""}`,
      [
        { text: "Cancel", style: "cancel" },
        ...RESOLUTION_OPTIONS.map((opt) => ({
          text: opt.label,
          style: (opt.destructive ? "destructive" : "default") as "destructive" | "default",
          onPress: async () => {
            const { error } = await supabase.rpc("mod_resolve_report", {
              p_report_id: report.report_id,
              p_resolution: opt.value,
            });
            if (error) {
              Alert.alert("Couldn't resolve", error.message);
              return;
            }
            await fetchReports();
          },
        })),
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
        <Text style={styles.headerTitle}>Reports ({reports.length})</Text>
        <View style={{ width: 60 }} />
      </View>
      <FlatList
        data={reports}
        keyExtractor={(item) => item.report_id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={<Text style={styles.emptyText}>No pending reports.</Text>}
        renderItem={({ item }) => <ReportRow row={item} onPress={() => resolve(item)} />}
      />
    </SafeAreaView>
  );
}

function ReportRow({ row, onPress }: { row: ModReportRow; onPress: () => void }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    resolveProfilePhotoUrl(row.reported_user_photo).then(setPhotoUrl);
  }, [row.reported_user_photo]);

  return (
    <Pressable onPress={onPress} style={styles.row}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitial}>{row.reported_user_name.charAt(0)}</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.reportedName}>{row.reported_user_name}</Text>
          {row.total_reports_against_user > 1 && (
            <View style={styles.repeatBadge}>
              <Text style={styles.repeatText}>×{row.total_reports_against_user}</Text>
            </View>
          )}
        </View>
        <Text style={[styles.reason, row.reason === "Underage user" && styles.reasonUrgent]}>
          {row.reason}
        </Text>
        {row.description && <Text style={styles.description} numberOfLines={2}>{row.description}</Text>}
        <Text style={styles.meta}>by {row.reporter_name}</Text>
      </View>
    </Pressable>
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
  row: {
    flexDirection: "row",
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { backgroundColor: colors.primary.lavenderMist, alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontFamily: fonts.heading, fontSize: 20, color: colors.primary.royalPurple },
  rowTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  reportedName: { fontSize: fontSizes.body, fontWeight: "700", color: colors.neutral.charcoal },
  repeatBadge: {
    backgroundColor: "#E53E3E",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  repeatText: { color: colors.neutral.white, fontSize: 10, fontWeight: "800" },
  reason: { fontSize: fontSizes.caption, color: colors.primary.wannaPurple, fontWeight: "700", marginTop: 2 },
  reasonUrgent: { color: "#E53E3E" },
  description: { fontSize: fontSizes.caption, color: colors.neutral.charcoal, marginTop: 4 },
  meta: { fontSize: fontSizes.caption, color: colors.neutral.slate, marginTop: 4, fontStyle: "italic" },
});
