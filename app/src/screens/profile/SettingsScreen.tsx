import React, { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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
import { Icon } from "../../components/Icon";

// The five notification types and the two channels we ship to. Settings UI
// renders this as a 5-row x 2-toggle matrix.
type NotificationType =
  | "interest"
  | "match"
  | "message"
  | "meetup"
  | "new_activities";
type NotificationChannel = "push" | "email";

type NotifPrefKey =
  | "notify_interest_push"
  | "notify_interest_email"
  | "notify_match_push"
  | "notify_match_email"
  | "notify_message_push"
  | "notify_message_email"
  | "notify_meetup_push"
  | "notify_meetup_email"
  | "notify_new_activities_push"
  | "notify_new_activities_email";

const NOTIF_ROWS: Array<{
  type: NotificationType;
  label: string;
  subtitle: string;
  pushKey: NotifPrefKey;
  emailKey: NotifPrefKey;
}> = [
  {
    type: "interest",
    label: "When someone's interested",
    subtitle: "X swiped right on your activity",
    pushKey: "notify_interest_push",
    emailKey: "notify_interest_email",
  },
  {
    type: "match",
    label: "New matches",
    subtitle: "You paired up with someone",
    pushKey: "notify_match_push",
    emailKey: "notify_match_email",
  },
  {
    type: "message",
    label: "Messages",
    subtitle: "New messages in your chats",
    pushKey: "notify_message_push",
    emailKey: "notify_message_email",
  },
  {
    type: "meetup",
    label: "Meetup check-ins",
    subtitle: "Quick 'did you meet?' prompts after a planned activity",
    pushKey: "notify_meetup_push",
    emailKey: "notify_meetup_email",
  },
  {
    type: "new_activities",
    label: "New activities",
    subtitle: "Periodic digest of new posts in your area",
    pushKey: "notify_new_activities_push",
    emailKey: "notify_new_activities_email",
  },
];

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [paused, setPaused] = useState(profile?.is_paused ?? false);
  const [readReceipts, setReadReceipts] = useState(
    profile?.read_receipts_enabled ?? false
  );

  // Local mirror of the 10 per-type x per-channel notification flags. We
  // optimistically update this on toggle and revert on supabase error.
  const [notifPrefs, setNotifPrefs] = useState<Record<NotifPrefKey, boolean>>({
    notify_interest_push: profile?.notify_interest_push ?? true,
    notify_interest_email: profile?.notify_interest_email ?? true,
    notify_match_push: profile?.notify_match_push ?? true,
    notify_match_email: profile?.notify_match_email ?? true,
    notify_message_push: profile?.notify_message_push ?? true,
    notify_message_email: profile?.notify_message_email ?? false,
    notify_meetup_push: profile?.notify_meetup_push ?? true,
    notify_meetup_email: profile?.notify_meetup_email ?? true,
    notify_new_activities_push: profile?.notify_new_activities_push ?? false,
    notify_new_activities_email: profile?.notify_new_activities_email ?? false,
  });

  const handleNotifToggle = async (
    key: NotifPrefKey,
    type: NotificationType,
    channel: NotificationChannel,
    value: boolean
  ) => {
    if (!user) return;
    // Optimistic update.
    setNotifPrefs((prev) => ({ ...prev, [key]: value }));
    const { error } = await supabase
      .from("profiles")
      .update({ [key]: value })
      .eq("id", user.id);
    if (error) {
      // Revert on failure.
      setNotifPrefs((prev) => ({ ...prev, [key]: !value }));
      Alert.alert("Couldn't update preference", error.message);
      return;
    }
    await refreshProfile();
    track("notification_pref_changed", { type, channel, enabled: value });
  };

  const handleReadReceiptsToggle = async (value: boolean) => {
    if (!user) return;
    setReadReceipts(value);
    const { error } = await supabase
      .from("profiles")
      .update({ read_receipts_enabled: value })
      .eq("id", user.id);
    if (error) {
      setReadReceipts(!value);
      Alert.alert("Couldn't update preference", error.message);
      return;
    }
    await refreshProfile();
    track("read_receipts_toggled", { enabled: value });
  };

  const applyPauseChange = async (value: boolean) => {
    if (!user) return;
    // Optimistic update
    setPaused(value);
    const { error } = await supabase
      .from("profiles")
      .update({ is_paused: value })
      .eq("id", user.id);
    if (error) {
      setPaused(!value);
      Alert.alert("Couldn't update", error.message);
      return;
    }
    await refreshProfile();
    track("profile_pause_toggled", { paused: value });

    // Fire-and-forget pause notification email (only when pausing, not unpausing)
    if (value) {
      supabase.functions
        .invoke("notify-account-state", { body: { action: "paused" } })
        .catch(() => {});
    }
  };

  // The pause toggle now goes through a confirmation dialog (mirroring
  // the Deactivate flow) so the user knows exactly what pausing means
  // before they commit. Unpausing is direct — no dialog, since it's a
  // straightforward "go live again" action.
  const handlePauseToggle = (value: boolean) => {
    if (!value) {
      applyPauseChange(false);
      return;
    }
    Alert.alert(
      "Pause your profile?",
      "While paused: your profile won't appear in anyone's Discover feed, and your active activities are hidden from other users. Existing matches and chats stay open. You can unpause any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Pause",
          style: "destructive",
          onPress: () => applyPauseChange(true),
        },
      ]
    );
  };

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
      "Your profile and activities will be hidden. Your data is retained for 30 days — log back in within that window to restore your account. After 30 days, your account is permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            if (!user) return;
            const { error } = await supabase
              .from("profiles")
              .update({
                is_active: false,
                deactivated_at: new Date().toISOString(),
              })
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
            // Fire-and-forget deactivation email. Must run before signOut so
            // the auth header is still valid for the edge function.
            try {
              await supabase.functions.invoke("notify-account-state", {
                body: { action: "deactivated" },
              });
            } catch {
              // non-fatal — user may not get the email but the account is
              // already marked deactivated server-side
            }
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

        <Group title="App preferences">
          <ToggleRow
            label="Read receipts"
            subtitle="Let people you're chatting with know when you've read their messages. Off by default."
            value={readReceipts}
            onValueChange={handleReadReceiptsToggle}
          />
        </Group>

        <Group title="Notifications">
          <View style={styles.notifGroup}>
            {/* Column header — small phosphor icons sit above each toggle
                column so the user can tell push vs email apart at a glance. */}
            <View style={styles.notifHeader}>
              <View style={{ flex: 1 }} />
              <View style={styles.notifHeaderIcon}>
                <Icon
                  name="Bell"
                  size={16}
                  color={colors.neutral.slate}
                  weight="bold"
                />
              </View>
              <View style={styles.notifHeaderIcon}>
                <Icon
                  name="EnvelopeSimple"
                  size={16}
                  color={colors.neutral.slate}
                  weight="bold"
                />
              </View>
            </View>
            {NOTIF_ROWS.map((row, idx) => (
              <View
                key={row.type}
                style={[
                  styles.notifRow,
                  idx === NOTIF_ROWS.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.notifRowLeft}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  <Text style={styles.toggleSubtitle}>{row.subtitle}</Text>
                </View>
                <View style={styles.notifSwitch}>
                  <Switch
                    value={notifPrefs[row.pushKey]}
                    onValueChange={(v) =>
                      handleNotifToggle(row.pushKey, row.type, "push", v)
                    }
                    trackColor={{
                      false: colors.neutral.slate,
                      true: colors.primary.wannaPurple,
                    }}
                    thumbColor={colors.neutral.white}
                  />
                </View>
                <View style={styles.notifSwitch}>
                  <Switch
                    value={notifPrefs[row.emailKey]}
                    onValueChange={(v) =>
                      handleNotifToggle(row.emailKey, row.type, "email", v)
                    }
                    trackColor={{
                      false: colors.neutral.slate,
                      true: colors.primary.wannaPurple,
                    }}
                    thumbColor={colors.neutral.white}
                  />
                </View>
              </View>
            ))}
          </View>
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
          <Row
            label="Sign out"
            onPress={() => {
              Alert.alert(
                "Sign out?",
                "Are you sure you want to sign out? You'll need to sign back in to access your account.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign out",
                    style: "destructive",
                    onPress: () => signOut(),
                  },
                ]
              );
            }}
          />
          {/* Pause my profile — click-then-toggle row. Tapping confirms the
              switch (tap again to undo). Sits between Sign out and
              Deactivate per design feedback. */}
          <Row
            label={paused ? "Unpause my profile" : "Pause my profile"}
            value={paused ? "Paused" : undefined}
            onPress={() => handlePauseToggle(!paused)}
          />
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

function ToggleRow({
  label,
  subtitle,
  value,
  onValueChange,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.toggleLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? (
          <Text style={styles.toggleSubtitle}>{subtitle}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: colors.neutral.slate,
          true: colors.primary.wannaPurple,
        }}
        thumbColor={colors.neutral.white}
      />
    </View>
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
  toggleLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  toggleSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginTop: 2,
    lineHeight: 16,
  },
  notifGroup: {
    paddingVertical: spacing.xs,
  },
  notifHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  notifHeaderIcon: {
    width: 52,
    alignItems: "center",
  },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  notifRowLeft: {
    flex: 1,
    marginRight: spacing.sm,
  },
  notifSwitch: {
    width: 52,
    alignItems: "center",
  },
  versionText: {
    textAlign: "center",
    color: colors.neutral.slate,
    fontSize: fontSizes.caption,
    marginTop: spacing.lg,
  },
});
