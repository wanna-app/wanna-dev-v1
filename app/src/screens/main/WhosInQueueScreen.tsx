import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { SwipeableUserCard } from "../../components/SwipeableUserCard";
import { UserCard } from "../../components/UserCard";
import { MatchModal } from "../../components/MatchModal";
import { ReportSheet } from "../../components/ReportSheet";
import { sendPush } from "../../lib/push";
import { sendMatchEmail } from "../../lib/email";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { track } from "../../lib/analytics";
import type { InterestedUser } from "../../types/whosin";
import { colors, spacing, fontSizes, fonts, shadows } from "../../theme";

interface RouteParams {
  activityId: string;
  title: string;
  hasActiveMatch: boolean;
  matchId: string | null;
}

const BATCH_SIZE = 10;

export function WhosInQueueScreen({ navigation, route }: any) {
  const { activityId, title } = route.params as RouteParams;
  const [hasActiveMatch, setHasActiveMatch] = useState<boolean>(
    route.params.hasActiveMatch
  );
  const [matchId, setMatchId] = useState<string | null>(route.params.matchId);
  const { user, profile } = useAuth();
  const [batch, setBatch] = useState<InterestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [batchNumber, setBatchNumber] = useState(1);
  const [batchStats, setBatchStats] = useState({ accepted: 0, rejected: 0 });
  const [matchedInfo, setMatchedInfo] = useState<{
    name: string;
    photo: string | null;
  } | null>(null);
  const [reportTarget, setReportTarget] = useState<InterestedUser | null>(null);
  const [activityPhotoUrl, setActivityPhotoUrl] = useState<string | null>(null);
  const cardOpenedAt = useRef(Date.now());

  // Fetch the activity's hero photo once so the MatchModal can use it
  // as the celebration image instead of a generic brand gradient.
  useEffect(() => {
    supabase
      .from("activities")
      .select("photo_url")
      .eq("id", activityId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.photo_url) setActivityPhotoUrl(data.photo_url);
      });
  }, [activityId]);

  const loadBatch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_interest_queue_batch", {
      p_activity_id: activityId,
      p_limit: BATCH_SIZE,
    });
    if (error) {
      console.warn("get_interest_queue_batch error:", error.message);
      setLoading(false);
      return;
    }
    setBatch((data ?? []) as InterestedUser[]);
    cardOpenedAt.current = Date.now();
    setLoading(false);

    track("interest_queue_opened", {
      activity_id: activityId,
      queue_size: data?.length ?? 0,
      unreviewed_count: data?.length ?? 0,
      batch_number: batchNumber,
    });
  }, [activityId, batchNumber]);

  useEffect(() => {
    loadBatch();
  }, [loadBatch]);

  const popTop = (next?: InterestedUser[]) => {
    setBatch((prev) => {
      const remaining = prev.slice(1);
      if (remaining.length === 0 && next && next.length > 0) {
        return next;
      }
      return remaining;
    });
    cardOpenedAt.current = Date.now();
  };

  const finishBatchIfDone = async () => {
    setBatchStats((s) => {
      track("batch_exhausted", {
        activity_id: activityId,
        batch_number: batchNumber,
        accepted_count: s.accepted,
        rejected_count: s.rejected,
      });
      return s;
    });
    setBatchNumber((n) => n + 1);
    setBatchStats({ accepted: 0, rejected: 0 });
    await loadBatch();
  };

  const handleSwipe = async (direction: "accept" | "reject") => {
    if (batch.length === 0 || !user) return;
    if (hasActiveMatch) return;
    const top = batch[0];
    const timeOnCardMs = Date.now() - cardOpenedAt.current;

    if (direction === "reject") {
      const { error } = await supabase.rpc("reject_interest", {
        p_queue_id: top.queue_id,
      });
      if (error) {
        Alert.alert("Couldn't pass", error.message);
        return;
      }
      track("interest_rejected", {
        activity_id: activityId,
        interested_user_id: top.user_id,
        time_on_card_ms: timeOnCardMs,
        batch_number: batchNumber,
      });
      setBatchStats((s) => ({ ...s, rejected: s.rejected + 1 }));
      const willBeEmpty = batch.length === 1;
      popTop();
      if (willBeEmpty) {
        await finishBatchIfDone();
      }
      return;
    }

    // Accept
    const { data: newMatchId, error } = await supabase.rpc(
      "accept_interest",
      { p_queue_id: top.queue_id }
    );
    if (error) {
      Alert.alert("Couldn't match", error.message);
      return;
    }

    track("interest_accepted", {
      match_id: newMatchId,
      activity_id: activityId,
      interested_user_id: top.user_id,
      time_in_queue_ms: Date.now() - new Date(top.created_at).getTime(),
      batch_number: batchNumber,
    });
    track("queue_locked", {
      activity_id: activityId,
      match_id: newMatchId,
      pending_remaining: batch.length - 1,
    });

    setHasActiveMatch(true);
    setMatchId(newMatchId as string);
    setBatch([]);
    setMatchedInfo({
      name: top.first_name,
      photo: top.photos[0] ?? null,
    });
    track("match_modal_shown", { match_id: newMatchId, action_taken: null });

    // Fire-and-forget push to BOTH parties — the edge function fans out
    // to whichever sides have device tokens and skips seed recipients.
    if (user && profile && newMatchId) {
      sendPush({
        type: "match",
        match_id: newMatchId as string,
        poster_id: user.id,
        interested_id: top.user_id,
        poster_name: profile.first_name,
        interested_name: top.first_name,
        activity_title: title,
      }).catch(() => {});

      // Email both parties (exactly-once per match, enforced server-side).
      sendMatchEmail({
        recipient_id: user.id,
        match_id: newMatchId as string,
      }).catch(() => {});
      sendMatchEmail({
        recipient_id: top.user_id,
        match_id: newMatchId as string,
      }).catch(() => {});
    }
  };

  const handleUnmatch = async () => {
    if (!matchId) return;
    Alert.alert(
      "Unmatch?",
      "This will close the conversation and unlock the queue for this activity.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unmatch",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.rpc("unmatch", {
              p_match_id: matchId,
            });
            if (error) {
              Alert.alert("Couldn't unmatch", error.message);
              return;
            }
            track("queue_unlocked", {
              activity_id: activityId,
              match_id: matchId,
              unlock_reason: "poster_unmatch",
            });
            setHasActiveMatch(false);
            setMatchId(null);
            await loadBatch();
          },
        },
      ]
    );
  };

  const sharedPreferences = (otherPrefs: string[]) =>
    profile?.activity_preferences?.filter((p) => otherPrefs.includes(p)) ?? [];

  const top = batch[0];
  const next = batch[1];

  // Pagination index (which card we're on within the current batch).
  // Computed from how many cards remain — if batch started at 10 and we
  // have 3 left, we're on card 8.
  const reviewedInBatch = (batchStats.accepted ?? 0) + (batchStats.rejected ?? 0);
  const totalInBatch = reviewedInBatch + batch.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Icon name="CaretLeft" size={22} color={colors.neutral.charcoal} weight="bold" />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Who's in</Text>
        </View>
        {hasActiveMatch && matchId ? (
          <Pressable onPress={handleUnmatch} hitSlop={8}>
            <Text style={styles.unmatchText}>Unmatch</Text>
          </Pressable>
        ) : !hasActiveMatch && batch.length > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>
              {reviewedInBatch + 1} of {totalInBatch}
            </Text>
          </View>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Pinned activity card — keeps the activity context front-and-center
          (mockup pattern). Gradient background, single line activity title. */}
      {!hasActiveMatch && batch.length > 0 && (
        <LinearGradient
          colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pinnedActivity}
        >
          <View style={styles.pinnedIcon}>
            <Icon name="HandWaving" size={24} color="#FFFFFF" weight="fill" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pinnedTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.pinnedSub} numberOfLines={1}>
              Batch {batchNumber} · {totalInBatch} interested
            </Text>
          </View>
          <Icon name="CaretRight" size={14} color="rgba(255,255,255,0.85)" weight="bold" />
        </LinearGradient>
      )}

      {/* Pagination dots — visual progress through the current batch */}
      {!hasActiveMatch && batch.length > 0 && totalInBatch > 1 && (
        <View style={styles.dotsRow}>
          {Array.from({ length: totalInBatch }).map((_, i) => {
            const isCurrent = i === reviewedInBatch;
            const isPast = i < reviewedInBatch;
            return (
              <View
                key={i}
                style={[
                  styles.dot,
                  isCurrent && styles.dotCurrent,
                  isPast && styles.dotPast,
                ]}
              />
            );
          })}
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
        </View>
      ) : hasActiveMatch ? (
        <View style={styles.lockedState}>
          <Text style={styles.lockedEmoji}>🔒</Text>
          <Text style={styles.lockedTitle}>
            You already have a match for this activity
          </Text>
          <Text style={styles.lockedSubtitle}>
            Unmatch to open the queue back up.
          </Text>
          <Button
            label="Open chat"
            variant="gradient"
            onPress={() => navigation.navigate("Matches" as never)}
            style={{ marginTop: spacing.lg, alignSelf: "stretch" }}
          />
        </View>
      ) : batch.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyTitle}>Queue empty</Text>
          <Text style={styles.emptySubtitle}>
            New people who swipe right on this activity will show up here.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.deckArea}>
            {next && (
              <View style={[styles.cardWrapper, styles.behindCard]}>
                <UserCard
                  user={next}
                  sharedPreferences={sharedPreferences(
                    next.activity_preferences
                  )}
                />
              </View>
            )}
            <View style={styles.cardWrapper}>
              <SwipeableUserCard
                key={top.queue_id}
                user={top}
                sharedPreferences={sharedPreferences(top.activity_preferences)}
                onSwiped={handleSwipe}
              />
            </View>
          </View>

          {/* Pass / Go-with-X CTAs (mockup pattern) */}
          <View style={styles.actions}>
            <Pressable
              style={styles.passBtn}
              onPress={() => handleSwipe("reject")}
            >
              <Icon
                name="X"
                size={18}
                color={colors.neutral.charcoal}
                weight="bold"
              />
              <Text style={styles.passLabel}>Pass</Text>
            </Pressable>
            <Pressable
              style={styles.acceptBtnOuter}
              onPress={() => handleSwipe("accept")}
            >
              <LinearGradient
                colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.acceptBtn}
              >
                <Icon name="HandWaving" size={18} color="#FFFFFF" weight="fill" />
                <Text style={styles.acceptLabel}>
                  Go with {top.first_name}
                </Text>
              </LinearGradient>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setReportTarget(top)}
            style={styles.reportLink}
            hitSlop={6}
          >
            <Text style={styles.reportLinkText}>⚠️ Report this user</Text>
          </Pressable>
        </>
      )}

      <MatchModal
        visible={!!matchedInfo}
        matchedName={matchedInfo?.name ?? ""}
        matchedPhoto={matchedInfo?.photo ?? null}
        activityPhotoUrl={activityPhotoUrl}
        activityTitle={title}
        yourName={profile?.first_name ?? "You"}
        onSayHi={() => {
          setMatchedInfo(null);
          navigation.navigate("Matches" as never);
        }}
        onKeepBrowsing={() => setMatchedInfo(null)}
      />

      <ReportSheet
        visible={!!reportTarget}
        reportedUserId={reportTarget?.user_id ?? ""}
        reportedUserName={reportTarget?.first_name ?? ""}
        reportedContentType="profile"
        source="whos_in_queue"
        onClose={() => setReportTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.subtle,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.neutral.charcoal,
    fontWeight: "700",
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    backgroundColor: "rgba(140,82,255,0.1)",
  },
  countBadgeText: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 13,
    color: colors.primary.wannaPurple,
  },
  unmatchText: {
    fontSize: fontSizes.body,
    color: "#E53E3E",
    fontWeight: "600",
    paddingHorizontal: spacing.sm,
  },
  // Pinned activity card (mockup pattern)
  pinnedActivity: {
    margin: spacing.md,
    marginTop: 12,
    padding: 12,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...shadows.brand,
  },
  pinnedIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinnedTitle: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  pinnedSub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  // Pagination dots
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingTop: 4,
    paddingBottom: 6,
  },
  dot: {
    height: 4,
    width: 18,
    borderRadius: 4,
    backgroundColor: colors.border.default,
  },
  dotPast: {
    backgroundColor: colors.primary.wannaPurple,
    opacity: 0.4,
  },
  dotCurrent: {
    width: 28,
    backgroundColor: colors.primary.wannaPurple,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deckArea: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    position: "relative",
  },
  cardWrapper: {
    ...StyleSheet.absoluteFillObject,
    margin: spacing.md,
  },
  behindCard: {
    transform: [{ scale: 0.94 }],
    opacity: 0.6,
  },
  // Pass / Go-with-X CTAs (mockup pattern — flex-row with gradient on accept)
  actions: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  passBtn: {
    flex: 1,
    height: 52,
    borderRadius: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    backgroundColor: "#FFFFFF",
  },
  passLabel: {
    fontFamily: fonts.heading,
    fontSize: 15,
    fontWeight: "700",
    color: colors.neutral.charcoal,
  },
  acceptBtnOuter: {
    flex: 1.4,
    borderRadius: 9999,
    overflow: "hidden",
    ...shadows.brand,
  },
  acceptBtn: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  acceptLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
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
  lockedState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  lockedEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  lockedTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  lockedSubtitle: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
    textAlign: "center",
  },
  reportLink: {
    alignItems: "center",
    paddingVertical: spacing.xs,
    paddingBottom: spacing.md,
  },
  reportLinkText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    fontWeight: "600",
  },
});
