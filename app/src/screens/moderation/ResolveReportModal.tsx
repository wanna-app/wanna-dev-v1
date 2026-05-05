// Modal for resolving a report. Replaces the previous Alert-based
// picker so we can collect the moderator-overridable fields added in
// migration 00043 (`removed_content_type` for content_removed bans,
// `ban_duration` for temp bans, `ban_reason` for any ban) when the
// chosen resolution warrants them. The values flow through the
// extended `mod_resolve_report` RPC (migration 00044) and onto the
// report row, where the moderate-user edge function picks them up if
// the email pipeline is wired in.

import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Button } from "../../components/Button";
import type { ModReportRow, ReportResolution } from "../../types/moderation";
import {
  borderRadius,
  colors,
  fontSizes,
  fonts,
  spacing,
} from "../../theme";

const RESOLUTION_OPTIONS: {
  value: ReportResolution;
  label: string;
  blurb: string;
  destructive?: boolean;
}[] = [
  {
    value: "no_action",
    label: "No action",
    blurb: "Close the report — nothing to do.",
  },
  {
    value: "warning",
    label: "Warn user",
    blurb: "Send a warning email but don't remove anything.",
  },
  {
    value: "content_removed",
    label: "Remove content",
    blurb: "Take down the content and email the user.",
  },
  {
    value: "temp_ban",
    label: "Temp ban",
    blurb: "Deactivate for a set duration. Auto-reactivates.",
    destructive: true,
  },
  {
    value: "permanent_ban",
    label: "Permanent ban",
    blurb: "Deactivate indefinitely. Email is added to blocklist.",
    destructive: true,
  },
];

const CONTENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "activity", label: "Activity" },
  { value: "photo", label: "Photo" },
  { value: "message", label: "Message" },
];

const BAN_DURATION_PRESETS: { value: string; label: string }[] = [
  { value: "24 hours", label: "24 hours" },
  { value: "7 days", label: "7 days" },
  { value: "30 days", label: "30 days" },
];

export interface ResolveSubmitPayload {
  resolution: ReportResolution;
  notes: string | null;
  removed_content_type: string | null;
  ban_duration: string | null;
  ban_reason: string | null;
}

interface Props {
  visible: boolean;
  report: ModReportRow | null;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (payload: ResolveSubmitPayload) => Promise<void> | void;
}

export function ResolveReportModal({
  visible,
  report,
  submitting,
  onClose,
  onSubmit,
}: Props) {
  const [resolution, setResolution] = useState<ReportResolution | null>(null);
  const [removedContentType, setRemovedContentType] = useState<string | null>(
    null,
  );
  const [banDuration, setBanDuration] = useState<string>(""); // free-text
  const [banReason, setBanReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Reset on every fresh open so a previous report's choices don't
  // leak in.
  useEffect(() => {
    if (visible) {
      setResolution(null);
      setRemovedContentType(null);
      setBanDuration("");
      setBanReason("");
      setNotes("");
    }
  }, [visible, report?.report_id]);

  // Pre-fill the content-type radio with whatever the reporter
  // originally flagged, since the moderator usually agrees with the
  // reporter on what the offending content actually is.
  useEffect(() => {
    if (resolution === "content_removed" && !removedContentType) {
      const reported = report?.reported_content_type;
      if (reported && CONTENT_TYPE_OPTIONS.some((o) => o.value === reported)) {
        setRemovedContentType(reported);
      }
    }
  }, [resolution, report?.reported_content_type, removedContentType]);

  const isContentRemoval = resolution === "content_removed";
  const isTempBan = resolution === "temp_ban";
  const isAnyBan = resolution === "temp_ban" || resolution === "permanent_ban";

  const submitDisabled = useMemo(() => {
    if (!resolution || submitting) return true;
    if (isContentRemoval && !removedContentType) return true;
    if (isTempBan && !banDuration.trim()) return true;
    if (isAnyBan && banReason.trim().length < 4) return true;
    return false;
  }, [
    resolution,
    submitting,
    isContentRemoval,
    removedContentType,
    isTempBan,
    banDuration,
    isAnyBan,
    banReason,
  ]);

  const handleSubmit = async () => {
    if (!resolution || submitDisabled) return;
    await onSubmit({
      resolution,
      notes: notes.trim() ? notes.trim() : null,
      removed_content_type: isContentRemoval ? removedContentType : null,
      ban_duration: isTempBan ? banDuration.trim() || null : null,
      ban_reason: isAnyBan ? banReason.trim() || null : null,
    });
  };

  if (!report) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            Resolve report
          </Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subjectName}>
            {report.reported_user_name}
          </Text>
          <Text style={styles.reasonLine}>
            Reported for: <Text style={styles.bold}>{report.reason}</Text>
          </Text>
          {report.description ? (
            <Text style={styles.description}>"{report.description}"</Text>
          ) : null}
          <Text style={styles.metaLine}>
            by {report.reporter_name}
            {report.total_reports_against_user > 1
              ? ` · ${report.total_reports_against_user} total reports`
              : ""}
          </Text>

          <Text style={styles.sectionHeader}>Action</Text>
          <View style={styles.optionList}>
            {RESOLUTION_OPTIONS.map((opt) => {
              const selected = resolution === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setResolution(opt.value)}
                  style={[
                    styles.optionCard,
                    selected && styles.optionCardSelected,
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      selected && styles.radioSelected,
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.optionLabel,
                        opt.destructive && styles.destructive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    <Text style={styles.optionBlurb}>{opt.blurb}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Content-removal: which type of content */}
          {isContentRemoval ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionHeader}>What got removed?</Text>
              <View style={styles.chipRow}>
                {CONTENT_TYPE_OPTIONS.map((opt) => {
                  const selected = removedContentType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setRemovedContentType(opt.value)}
                      style={[
                        styles.chip,
                        selected && styles.chipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* Temp-ban: duration, with presets + custom input */}
          {isTempBan ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionHeader}>Duration</Text>
              <View style={styles.chipRow}>
                {BAN_DURATION_PRESETS.map((opt) => {
                  const selected = banDuration === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setBanDuration(opt.value)}
                      style={[
                        styles.chip,
                        selected && styles.chipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={banDuration}
                onChangeText={setBanDuration}
                placeholder="Or type a custom duration (e.g. “14 days”)"
                placeholderTextColor={colors.neutral.slate}
                style={styles.input}
              />
            </View>
          ) : null}

          {/* Any ban: short user-facing explanation */}
          {isAnyBan ? (
            <View style={styles.fieldGroup}>
              <Text style={styles.sectionHeader}>
                Explanation shown to user
              </Text>
              <Text style={styles.helpText}>
                One line. Visible in the email — keep it factual and
                non-revealing about reporters.
              </Text>
              <TextInput
                value={banReason}
                onChangeText={setBanReason}
                placeholder='e.g. "Harassment in chat after prior warning"'
                placeholderTextColor={colors.neutral.slate}
                style={styles.input}
                multiline
                maxLength={500}
              />
            </View>
          ) : null}

          <View style={styles.fieldGroup}>
            <Text style={styles.sectionHeader}>Internal notes (optional)</Text>
            <Text style={styles.helpText}>
              Not shown to the user. For your future-self / co-mods.
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything worth remembering about this case"
              placeholderTextColor={colors.neutral.slate}
              style={[styles.input, { minHeight: 80 }]}
              multiline
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Button
            label={submitting ? "Resolving…" : "Resolve report"}
            variant="primary"
            onPress={handleSubmit}
            disabled={submitDisabled}
            loading={submitting}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.neutral.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  cancelText: {
    fontSize: fontSizes.body,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
    width: 60,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.charcoal,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  subjectName: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.neutral.charcoal,
    marginBottom: 4,
  },
  reasonLine: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    marginBottom: 4,
  },
  bold: { fontWeight: "700", color: colors.primary.wannaPurple },
  description: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    fontStyle: "italic",
    marginVertical: spacing.xs,
  },
  metaLine: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
  },
  sectionHeader: {
    fontSize: fontSizes.caption,
    fontWeight: "700",
    color: colors.neutral.charcoal,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  optionList: { gap: spacing.sm },
  optionCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.neutral.cloud,
    borderWidth: 1,
    borderColor: colors.neutral.cloud,
  },
  optionCardSelected: {
    borderColor: colors.primary.wannaPurple,
    backgroundColor: colors.primary.lavenderMist + "33",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.neutral.slate,
    marginTop: 2,
  },
  radioSelected: {
    borderColor: colors.primary.wannaPurple,
    backgroundColor: colors.primary.wannaPurple,
  },
  optionLabel: {
    fontSize: fontSizes.body,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  destructive: { color: "#E53E3E" },
  optionBlurb: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginTop: 2,
  },
  fieldGroup: { marginTop: spacing.md },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.neutral.cloud,
    borderWidth: 1,
    borderColor: colors.neutral.cloud,
  },
  chipSelected: {
    backgroundColor: colors.primary.wannaPurple,
    borderColor: colors.primary.wannaPurple,
  },
  chipText: {
    fontSize: fontSizes.caption,
    fontWeight: "600",
    color: colors.neutral.charcoal,
  },
  chipTextSelected: { color: colors.neutral.white },
  helpText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    marginTop: spacing.xs,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.cloud,
  },
});
