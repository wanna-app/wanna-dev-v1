import React, { useState } from "react";
import {
  Alert,
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
import { Button } from "./Button";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { track } from "../lib/analytics";
import {
  REPORT_REASONS,
  type ReportReason,
  type ReportedContentType,
} from "../constants/enums";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../theme";

interface ReportSheetProps {
  visible: boolean;
  reportedUserId: string;
  reportedUserName: string;
  reportedContentType?: ReportedContentType;
  reportedContentId?: string;
  source: string; // analytics label
  onClose: () => void;
  onAfterSubmit?: () => void; // e.g. close chat after block-and-report
}

type Step = "reason" | "description" | "confirm" | "blockPrompt";

const COOLDOWN_HOURS = 24;

export function ReportSheet({
  visible,
  reportedUserId,
  reportedUserName,
  reportedContentType,
  reportedContentId,
  source,
  onClose,
  onAfterSubmit,
}: ReportSheetProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("reason");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep("reason");
    setReason(null);
    setDescription("");
    setSubmitting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const checkCooldown = async (): Promise<boolean> => {
    if (!user || !reason) return false;
    const since = new Date(
      Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000
    ).toISOString();
    const { data } = await supabase
      .from("reports")
      .select("id, created_at")
      .eq("reporter_id", user.id)
      .eq("reported_user_id", reportedUserId)
      .eq("reason", reason)
      .gte("created_at", since)
      .limit(1);
    return (data?.length ?? 0) > 0;
  };

  const submitReport = async () => {
    if (!user || !reason) return;
    setSubmitting(true);

    const isDuplicate = await checkCooldown();
    if (isDuplicate) {
      setSubmitting(false);
      Alert.alert(
        "Already reported",
        `You reported ${reportedUserName} for this reason recently. Reports are reviewed within 24 hours.`,
        [{ text: "OK", onPress: close }]
      );
      return;
    }

    if (reason === "Other" && description.trim().length < 5) {
      setSubmitting(false);
      Alert.alert(
        "Description required",
        "Please add a few details when picking 'Other'."
      );
      return;
    }

    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: reportedUserId,
      reported_content_type: reportedContentType ?? "profile",
      reported_content_id: reportedContentId ?? null,
      reason,
      description: description.trim() || null,
    });
    setSubmitting(false);

    if (error) {
      Alert.alert("Couldn't submit", error.message);
      return;
    }

    track("report_submitted", {
      reported_user_id: reportedUserId,
      reason,
      has_description: description.trim().length > 0,
      source,
    });

    setStep("blockPrompt");
  };

  const blockUser = async () => {
    if (!user) return;
    const { error } = await supabase.from("blocks").insert({
      blocker_id: user.id,
      blocked_user_id: reportedUserId,
    });
    if (error && !error.message.includes("duplicate")) {
      Alert.alert("Couldn't block", error.message);
      return;
    }
    track("user_blocked", {
      blocked_user_id: reportedUserId,
      source: `${source}_post_report`,
    });

    // Auto-unmatch any active matches with this user
    const { data: activeMatches } = await supabase
      .from("matches")
      .select("id")
      .eq("status", "active")
      .or(`poster_id.eq.${user.id},interested_id.eq.${user.id}`);
    const myMatches = (activeMatches ?? []) as { id: string }[];
    for (const m of myMatches) {
      await supabase.rpc("unmatch", { p_match_id: m.id });
    }
    close();
    onAfterSubmit?.();
  };

  const skipBlock = () => {
    close();
    onAfterSubmit?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={close} style={styles.headerBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {step === "blockPrompt" ? "Block too?" : "Report"}
          </Text>
          <View style={{ width: 60 }} />
        </View>

        {step === "reason" && (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Text style={styles.title}>Why are you reporting {reportedUserName}?</Text>
            <Text style={styles.subtitle}>
              Reports are confidential. Our team aims to review all reports within 24 hours.
            </Text>
            <View style={styles.reasonList}>
              {REPORT_REASONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
                  style={[
                    styles.reasonRow,
                    reason === r && styles.reasonRowSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.reasonText,
                      reason === r && styles.reasonTextSelected,
                    ]}
                  >
                    {r}
                  </Text>
                  {reason === r && (
                    <Text style={styles.reasonCheck}>✓</Text>
                  )}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        {step === "description" && (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>Add details</Text>
            <Text style={styles.subtitle}>
              {reason === "Other"
                ? "Required — tell us what happened (max 500 chars)."
                : "Optional — what should our team know? (max 500 chars)"}
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What happened?"
              placeholderTextColor={colors.neutral.slate}
              style={styles.textArea}
              multiline
              maxLength={500}
              autoFocus
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{description.length}/500</Text>
          </ScrollView>
        )}

        {step === "confirm" && (
          <View style={styles.confirmWrapper}>
            <Text style={styles.title}>Submit this report?</Text>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Reason</Text>
              <Text style={styles.summaryValue}>{reason}</Text>
              {description.trim().length > 0 && (
                <>
                  <Text style={[styles.summaryLabel, { marginTop: spacing.md }]}>
                    Details
                  </Text>
                  <Text style={styles.summaryValue}>{description.trim()}</Text>
                </>
              )}
            </View>
            <Text style={styles.fineprint}>
              You can also block this user after submitting. Blocking removes
              all matches and hides them from your feed.
            </Text>
          </View>
        )}

        {step === "blockPrompt" && (
          <View style={styles.confirmWrapper}>
            <Text style={styles.eyebrow}>✓ Report received</Text>
            <Text style={styles.title}>Block {reportedUserName}?</Text>
            <Text style={styles.subtitle}>
              Blocking will unmatch any active matches with this person and
              hide them from your feed. They won't be notified.
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          {step === "reason" && (
            <Button
              label="Next"
              variant="gradient"
              onPress={() => setStep("description")}
              disabled={!reason}
            />
          )}
          {step === "description" && (
            <View style={{ gap: spacing.sm }}>
              <Button
                label="Review"
                variant="gradient"
                onPress={() => setStep("confirm")}
                disabled={
                  reason === "Other" && description.trim().length < 5
                }
              />
              <Button
                label="Back"
                variant="ghost"
                onPress={() => setStep("reason")}
              />
            </View>
          )}
          {step === "confirm" && (
            <View style={{ gap: spacing.sm }}>
              <Button
                label={submitting ? "Submitting…" : "Submit report"}
                variant="gradient"
                onPress={submitReport}
                loading={submitting}
              />
              <Button
                label="Back"
                variant="ghost"
                onPress={() => setStep("description")}
              />
            </View>
          )}
          {step === "blockPrompt" && (
            <View style={{ gap: spacing.sm }}>
              <Button
                label={`Block ${reportedUserName}`}
                variant="primary"
                onPress={blockUser}
              />
              <Button
                label="No thanks"
                variant="ghost"
                onPress={skipBlock}
              />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  headerBtn: { paddingHorizontal: spacing.sm, minWidth: 60 },
  cancelText: { fontSize: fontSizes.body, color: colors.neutral.charcoal },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.charcoal,
  },
  scroll: { padding: spacing.lg },
  confirmWrapper: { flex: 1, padding: spacing.lg },
  eyebrow: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.body,
    color: colors.primary.wannaPurple,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  reasonList: {
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.neutral.cloud,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  reasonRowSelected: {
    backgroundColor: colors.primary.lavenderMist,
  },
  reasonText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  reasonTextSelected: {
    color: colors.primary.royalPurple,
    fontWeight: "700",
  },
  reasonCheck: {
    fontSize: fontSizes.subhead,
    color: colors.primary.wannaPurple,
    fontWeight: "800",
  },
  textArea: {
    minHeight: 160,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  charCount: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    textAlign: "right",
    marginTop: spacing.xs,
  },
  summaryCard: {
    backgroundColor: colors.neutral.cloud,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  summaryLabel: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
    lineHeight: 22,
  },
  fineprint: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    lineHeight: 18,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.cloud,
  },
});
