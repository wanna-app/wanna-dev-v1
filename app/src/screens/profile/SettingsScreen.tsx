import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { track } from "../../lib/analytics";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { user, profile, signOut, refreshProfile } = useAuth();

  const handleExportData = async () => {
    if (!user) return;
    Alert.alert(
      "Download your data?",
      "We'll generate a JSON file with everything Wanna stores about you and open the share sheet so you can save or send it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Download",
          onPress: async () => {
            try {
              const { data, error } = await supabase.functions.invoke(
                "export-user-data",
                { body: {} }
              );
              if (error || !data) throw error ?? new Error("no data");
              const path = `${FileSystem.cacheDirectory}wanna-export-${Date.now()}.json`;
              await FileSystem.writeAsStringAsync(
                path,
                JSON.stringify(data, null, 2),
                { encoding: FileSystem.EncodingType.UTF8 }
              );
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(path, {
                  mimeType: "application/json",
                  dialogTitle: "Save your Wanna data export",
                });
              } else {
                Alert.alert("Saved", `Export written to ${path}`);
              }
              track("profile_data_export_downloaded", {});
            } catch (e: any) {
              Alert.alert(
                "Export failed",
                e?.message ?? "Couldn't generate your data export"
              );
            }
          },
        },
      ]
    );
  };

  const handleDeactivate = () => {
    Alert.alert(
      "Deactivate account?",
      "Your profile and activities will be hidden. Your matches and chats are preserved. You can reactivate anytime by signing back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            const { error } = await supabase
              .from("profiles")
              .update({ is_active: false })
              .eq("id", user.id);
            if (error) {
              Alert.alert("Couldn't deactivate", error.message);
              return;
            }
            track("profile_deactivated", {
              account_age_days: profile
                ? Math.floor(
                    (Date.now() - new Date(profile.created_at).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                : 0,
              was_verified: profile?.is_verified ?? false,
            });
            await refreshProfile();
            await signOut();
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
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Group title="Account">
          <Row
            label="Edit profile"
            onPress={() => navigation.navigate("EditProfile")}
          />
          <Row
            label="Discovery preferences"
            onPress={() => navigation.navigate("DiscoveryPreferences")}
          />
          <Row
            label={profile?.is_verified ? "Verified" : "Get verified"}
            value={profile?.is_verified ? "✓" : "Recommended"}
            onPress={
              profile?.is_verified
                ? undefined
                : () => navigation.navigate("Verification")
            }
          />
        </Group>

        <Group title="Safety">
          <Row
            label="Blocked users"
            onPress={() => navigation.navigate("BlockList")}
          />
        </Group>

        <Group title="Privacy">
          <Row label="Download my data" onPress={handleExportData} />
        </Group>

        <Group title="Account actions">
          <Row label="Sign out" onPress={signOut} />
          <Row
            label="Deactivate account"
            destructive
            onPress={handleDeactivate}
          />
        </Group>

        <Text style={styles.versionText}>Wanna · v0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  destructive,
  onPress,
}: {
  label: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, !onPress && { opacity: 0.5 }]}
      disabled={!onPress}
    >
      <Text style={[styles.rowLabel, destructive && styles.rowDestructive]}>
        {label}
      </Text>
      <View style={styles.rowRight}>
        {value && <Text style={styles.rowValue}>{value}</Text>}
        {onPress && <Text style={styles.rowChevron}>›</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.cloud },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.neutral.white,
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
  scroll: { padding: spacing.lg },
  group: { marginBottom: spacing.lg },
  groupTitle: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.sm,
  },
  groupBody: {
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  rowLabel: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  rowDestructive: {
    color: "#E53E3E",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  rowValue: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
  },
  rowChevron: {
    fontSize: 22,
    color: colors.neutral.slate,
  },
  versionText: {
    textAlign: "center",
    color: colors.neutral.slate,
    fontSize: fontSizes.caption,
    marginTop: spacing.lg,
  },
});
