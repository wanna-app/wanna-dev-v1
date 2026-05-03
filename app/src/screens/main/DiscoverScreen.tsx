import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Button } from "../../components/Button";
import { CategoryFilterRow } from "../../components/CategoryFilterRow";
import { Icon } from "../../components/Icon";
import { Mode, MODE_META, ModePicker } from "../../components/ModePicker";
import { SwipeableCard } from "../../components/SwipeableCard";
import { ExpandedCardModal } from "../../components/ExpandedCardModal";
import { FirstMessageModal } from "../../components/FirstMessageModal";
import type { ActivityCategory } from "../../constants/categories";
import { useAuth } from "../../hooks/useAuth";
import { useNetwork } from "../../hooks/useNetwork";
import { supabase } from "../../lib/supabase";
import { track } from "../../lib/analytics";
import { enqueue, flushQueue, loadQueue } from "../../lib/offlineQueue";
import { sendPush } from "../../lib/push";
import { sendInterestEmail } from "../../lib/email";
import type { FeedCard } from "../../types/feed";
import {
  colors,
  spacing,
  borderRadius,
  fontSizes,
  fonts,
  shadows,
} from "../../theme";

const PAGE_SIZE = 20;
const SWIPE_QUEUE = "swipes";

interface QueuedSwipe {
  swiper_id: string;
  activity_id: string;
  activity_owner_id: string;
  direction: "like" | "pass";
  also_express_interest: boolean;
  /** Mode the swiper was in when they liked the card. */
  swiper_mode: "friends" | "dating" | "networking";
}

interface UndoState {
  card: FeedCard;
  swipeId: string | null; // null when undo is for an offline-queued swipe
  queuedSwipeIds?: string[]; // entry ids in the offline queue, if any
}

export function DiscoverScreen({ navigation }: { navigation: any }) {
  const { user, profile } = useAuth();
  const { online } = useNetwork();
  const [cards, setCards] = useState<FeedCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCard, setExpandedCard] = useState<FeedCard | null>(null);
  const [undoable, setUndoable] = useState<UndoState | null>(null);
  // After a swipe-right or "I'm in" online insert, we open this modal so
  // the user can attach an optional 1-line note that the poster sees on
  // the Who's In list. Skipping is first-class.
  const [firstMessagePrompt, setFirstMessagePrompt] = useState<{
    activityId: string;
    activityTitle: string;
    posterName: string;
  } | null>(null);
  // Mode switcher state — defaults to first mode in user's discovery prefs.
  const [mode, setMode] = useState<Mode>("friends");
  const [modePickerOpen, setModePickerOpen] = useState(false);
  // Category filter ("For you" when null)
  const [categoryFilter, setCategoryFilter] = useState<ActivityCategory | null>(
    null
  );
  const cardOpenedAt = useRef<number>(Date.now());
  const sessionStats = useRef({ seen: 0, likes: 0, passes: 0 });

  const fetchFeed = useCallback(
    async (cursor?: string): Promise<FeedCard[]> => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("get_feed", {
        p_user_id: user.id,
        p_cursor: cursor ?? null,
        p_limit: PAGE_SIZE,
        p_mode_filter: mode,
        p_category_filter: categoryFilter,
      });
      if (error) {
        console.warn("get_feed error:", error.message);
        return [];
      }
      return (data ?? []) as FeedCard[];
    },
    [user, mode, categoryFilter]
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    const data = await fetchFeed();
    setCards(data);
    cardOpenedAt.current = Date.now();
    setLoading(false);
  }, [fetchFeed]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  // Flush queued swipes when we come back online
  useEffect(() => {
    if (!user || !online) return;
    let cancelled = false;
    (async () => {
      const queued = await loadQueue<QueuedSwipe>(SWIPE_QUEUE);
      if (cancelled || queued.length === 0) return;
      const result = await flushQueue<QueuedSwipe>(
        SWIPE_QUEUE,
        async (payload) => {
          // Insert swipe (unique constraint dedupes)
          const { error: swipeError } = await supabase.from("swipes").insert({
            swiper_id: payload.swiper_id,
            activity_id: payload.activity_id,
            activity_owner_id: payload.activity_owner_id,
            direction: payload.direction,
            swiper_mode: payload.swiper_mode,
          });
          if (swipeError && !swipeError.message.includes("duplicate")) {
            throw swipeError;
          }
          if (payload.also_express_interest) {
            const { error: queueError } = await supabase
              .from("interest_queue")
              .insert({
                activity_id: payload.activity_id,
                interested_user_id: payload.swiper_id,
                swiper_mode: payload.swiper_mode,
              });
            if (queueError && !queueError.message.includes("duplicate")) {
              throw queueError;
            }
          }
        }
      );
      if (result.flushed > 0) {
        track("swipe_queue_flushed", { flushed: result.flushed });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, online]);

  // Realtime: when a new matching activity is posted, prepend it to the deck.
  // Uses get_feed (with cursor=null) on each event and keeps only cards we
  // haven't already seen (set diff against current deck + swipes are filtered
  // by the RPC itself).
  useEffect(() => {
    if (!user) return;

    let mounted = true;
    const refreshTopOfFeed = async () => {
      const fresh = await fetchFeed();
      if (!mounted) return;
      setCards((current) => {
        const knownIds = new Set(current.map((c) => c.activity_id));
        const newCards = fresh.filter((c) => !knownIds.has(c.activity_id));
        if (newCards.length === 0) return current;
        track("feed_refreshed", {
          new_cards_count: newCards.length,
          trigger: "realtime",
        });
        // Prepend fresh, dedupe-merge with existing
        return [...newCards, ...current];
      });
    };

    const channel = supabase
      .channel(`feed-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activities" },
        () => refreshTopOfFeed()
      )
      .subscribe();

    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, [user, fetchFeed]);

  const onRefresh = async () => {
    setRefreshing(true);
    sessionStats.current = { seen: 0, likes: 0, passes: 0 };
    const data = await fetchFeed();
    track("feed_refreshed", {
      new_cards_count: data.length,
      trigger: "pull_to_refresh",
    });
    setCards(data);
    setUndoable(null);
    cardOpenedAt.current = Date.now();
    setRefreshing(false);
  };

  const popTopCard = () => {
    setCards((prev) => prev.slice(1));
    cardOpenedAt.current = Date.now();
    if (online && cards.length <= 3) {
      const oldestVisible = cards[cards.length - 1];
      if (oldestVisible) {
        fetchFeed(oldestVisible.created_at).then((more) => {
          if (more.length > 0) {
            setCards((prev) => [...prev, ...more]);
          }
        });
      }
    }
  };

  const handleSwipe = async (direction: "like" | "pass") => {
    if (!user || cards.length === 0) return;
    const top = cards[0];
    const timeOnCardMs = Date.now() - cardOpenedAt.current;
    sessionStats.current.seen += 1;

    track(direction === "like" ? "swipe_like" : "swipe_pass", {
      activity_id: top.activity_id,
      activity_owner_id: top.poster_id,
      category: top.category,
      card_position: sessionStats.current.seen,
      time_on_card_ms: timeOnCardMs,
      source: "swipe",
    });

    const cardForUndo = top;
    popTopCard();

    if (direction === "like") sessionStats.current.likes += 1;
    else sessionStats.current.passes += 1;

    // Offline path: queue both the swipe and (for likes) the interest_queue
    // insert. Server-side dedup via the unique (swiper_id, activity_id)
    // constraint protects us from double-applies.
    if (!online) {
      const swipeEntry = await enqueue<QueuedSwipe>(SWIPE_QUEUE, {
        swiper_id: user.id,
        activity_id: top.activity_id,
        activity_owner_id: top.poster_id,
        direction,
        also_express_interest: direction === "like",
        swiper_mode: mode,
      });
      if (direction === "like") {
        track("interest_expressed", {
          activity_id: top.activity_id,
          interested_user_id: user.id,
          offline: true,
        });
        setUndoable(null);
      } else {
        setUndoable({
          card: cardForUndo,
          swipeId: null,
          queuedSwipeIds: [swipeEntry.id],
        });
      }
      return;
    }

    // Online path
    const { data: swipeRow, error: swipeError } = await supabase
      .from("swipes")
      .insert({
        swiper_id: user.id,
        activity_id: top.activity_id,
        activity_owner_id: top.poster_id,
        direction,
        swiper_mode: mode,
      })
      .select()
      .single();

    if (swipeError) {
      console.warn("swipe insert error:", swipeError.message);
    }

    if (direction === "like") {
      const { error: queueError } = await supabase
        .from("interest_queue")
        .insert({
          activity_id: top.activity_id,
          interested_user_id: user.id,
          swiper_mode: mode,
        });
      if (queueError) console.warn("queue insert error:", queueError.message);

      track("interest_expressed", {
        activity_id: top.activity_id,
        interested_user_id: user.id,
      });

      // Open the optional first-message prompt. The DB row exists at
      // this point with first_message=NULL — if the user types and
      // sends a note, we patch the row in-place. Skip is a no-op.
      setFirstMessagePrompt({
        activityId: top.activity_id,
        activityTitle: top.title,
        posterName: top.poster_name,
      });

      // Fire-and-forget push to the activity owner ("[Name] is in for ...!").
      // The edge function debounces to max 1 per activity per 15 min and
      // skips seed users.
      sendPush({
        type: "interest",
        activity_id: top.activity_id,
        poster_id: top.poster_id,
        interested_user_name: profile?.first_name ?? "Someone",
        activity_title: top.title,
      }).catch(() => {});

      // Email backup with much longer debounce (1 per activity per 24h).
      sendInterestEmail({
        recipient_id: top.poster_id,
        activity_id: top.activity_id,
      }).catch(() => {});

      setUndoable(null);
    } else {
      if (swipeRow) {
        setUndoable({ card: cardForUndo, swipeId: swipeRow.id });
      }
    }
  };

  const handleUndo = async () => {
    if (!undoable) return;
    // Offline-queued swipe: just remove from the queue.
    if (undoable.queuedSwipeIds && undoable.queuedSwipeIds.length > 0) {
      const { removeFromQueue } = await import("../../lib/offlineQueue");
      await removeFromQueue(SWIPE_QUEUE, undoable.queuedSwipeIds);
    } else if (undoable.swipeId) {
      const { error } = await supabase
        .from("swipes")
        .delete()
        .eq("id", undoable.swipeId);
      if (error) {
        console.warn("undo error:", error.message);
        return;
      }
    }
    track("swipe_undo", {
      activity_id: undoable.card.activity_id,
      original_direction: "pass",
    });
    setCards((prev) => [undoable.card, ...prev]);
    setUndoable(null);
    cardOpenedAt.current = Date.now();
  };

  const handleTap = () => {
    if (cards.length === 0) return;
    const top = cards[0];
    track("card_expanded", {
      activity_id: top.activity_id,
      time_on_card_ms: Date.now() - cardOpenedAt.current,
    });
    setExpandedCard(top);
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

  if (cards.length === 0) {
    track("feed_exhausted", {
      cards_seen_session: sessionStats.current.seen,
      likes_session: sessionStats.current.likes,
      passes_session: sessionStats.current.passes,
      mode,
      category_filter: categoryFilter,
    });
    // Empty-state copy is category-aware: when the user has filtered to a
    // specific category and run out, encourage broadening or posting their
    // own. When no filter is applied, the existing message is fine.
    const filteredTitle = categoryFilter
      ? `No more ${categoryFilter} activities`
      : "You're all caught up";
    const filteredSub = categoryFilter
      ? "Try a different category, post your own, or check back later."
      : "New activities show up all the time. Pull down to refresh, or post your own to get the conversation started.";
    return (
      <SafeAreaView style={styles.container}>
        <DiscoverHeader
          navigation={navigation}
          mode={mode}
          onOpenModePicker={() => setModePickerOpen(true)}
        />
        <ScrollView
          contentContainerStyle={styles.emptyContainer}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <Icon name="Sparkle" size={56} color={colors.primary.wannaPurple} weight="fill" />
          <Text style={styles.emptyTitle}>{filteredTitle}</Text>
          <Text style={styles.emptySubtitle}>{filteredSub}</Text>
          {categoryFilter && (
            <Button
              label="Show all categories"
              variant="outline"
              onPress={() => setCategoryFilter(null)}
              style={{ marginTop: spacing.lg, alignSelf: "stretch" }}
            />
          )}
          <Button
            label="Post an activity"
            variant="gradient"
            onPress={() => navigation.navigate("Post")}
            style={{ marginTop: spacing.sm, alignSelf: "stretch" }}
          />
        </ScrollView>
        <ModePicker
          visible={modePickerOpen}
          current={mode}
          onClose={() => setModePickerOpen(false)}
          onSelect={setMode}
        />
      </SafeAreaView>
    );
  }

  const top = cards[0];
  const next = cards[1];

  return (
    // Background goes black so the full-bleed photo blends into chrome.
    <View style={styles.bleedContainer}>
      <SafeAreaView style={styles.bleedSafe} edges={["top"]}>
        {/* Top chrome — overlays the photo with translucent buttons */}
        <DiscoverHeader
          navigation={navigation}
          mode={mode}
          onOpenModePicker={() => setModePickerOpen(true)}
        />
        {/* Category filter chips, scrolling horizontally (mockup pattern) */}
        <CategoryFilterRow
          active={categoryFilter}
          onChange={setCategoryFilter}
        />
      </SafeAreaView>

      <View style={styles.deckArea}>
        {next && (
          <View style={[styles.cardWrapper, styles.behindCard]}>
            <SwipeableCard card={next} onSwiped={() => {}} />
          </View>
        )}
        <View style={styles.cardWrapper}>
          <SwipeableCard
            key={top.activity_id}
            card={top}
            onSwiped={handleSwipe}
            onTap={handleTap}
            onHostPress={() =>
              navigation.navigate("UserProfile", { userId: top.poster_id })
            }
          />
        </View>
      </View>

      {/* Floating action row — sits above the tab bar (mockup: pass / like / bookmark).
          Undo button replaces bookmark for now since it's the existing capability. */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.smallAction, styles.passButton]}
          onPress={() => handleSwipe("pass")}
        >
          <Icon name="X" size={22} color={colors.neutral.charcoal} weight="bold" />
        </Pressable>
        <Pressable
          style={styles.likeButtonOuter}
          onPress={() => handleSwipe("like")}
        >
          <LinearGradient
            colors={[colors.primary.wannaPurple, colors.secondary.wannaCyan]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.likeButton}
          >
            <Icon name="HandWaving" size={28} color="#FFFFFF" weight="fill" />
          </LinearGradient>
        </Pressable>
        <Pressable
          style={[styles.smallAction, styles.undoButton, !undoable && styles.undoButtonDisabled]}
          onPress={handleUndo}
          disabled={!undoable}
        >
          <Icon
            name="ArrowCounterClockwise"
            size={20}
            color={undoable ? colors.primary.wannaPurple : colors.neutral.slate}
            weight="bold"
          />
        </Pressable>
      </View>

      <ExpandedCardModal
        card={expandedCard}
        onClose={() => setExpandedCard(null)}
        onHostPress={() => {
          if (!expandedCard) return;
          const id = expandedCard.poster_id;
          setExpandedCard(null);
          // Wait a tick so the modal can dismiss before pushing the screen
          setTimeout(
            () => navigation.navigate("UserProfile", { userId: id }),
            100
          );
        }}
      />

      <ModePicker
        visible={modePickerOpen}
        current={mode}
        onClose={() => setModePickerOpen(false)}
        onSelect={setMode}
      />

      {firstMessagePrompt && (
        <FirstMessageModal
          visible={!!firstMessagePrompt}
          activityTitle={firstMessagePrompt.activityTitle}
          posterName={firstMessagePrompt.posterName}
          onSkip={() => setFirstMessagePrompt(null)}
          onSubmit={async (message) => {
            const activityId = firstMessagePrompt.activityId;
            setFirstMessagePrompt(null);
            if (!user) return;
            // Patch the queue row that was just inserted. RLS allows
            // the swiper to update their own row, scoped to the same
            // activity. We don't surface failures to the user — the
            // worst case is the note doesn't show up on the poster's
            // list, which is recoverable.
            const { error } = await supabase
              .from("interest_queue")
              .update({ first_message: message })
              .eq("activity_id", activityId)
              .eq("interested_user_id", user.id);
            if (error) {
              console.warn("first_message update error:", error.message);
              return;
            }
            track("first_message_sent", {
              activity_id: activityId,
              length: message.length,
            });
          }}
        />
      )}
    </View>
  );
}

/**
 * Reusable header strip with the Wanna wordmark + mode pill + filter button.
 * Designed to overlay the full-bleed activity photo, so backgrounds are
 * either transparent (over the photo) or translucent white.
 */
function DiscoverHeader({
  navigation,
  mode,
  onOpenModePicker,
}: {
  navigation: any;
  mode: Mode;
  onOpenModePicker: () => void;
}) {
  const openFilters = () => {
    // Discovery preferences (gender / age / distance) lives in the Profile
    // stack. Mode + category live on Discover itself now (E2).
    try {
      navigation
        .getParent()
        ?.navigate("Profile", {
          screen: "DiscoveryPreferences",
        });
    } catch {
      Alert.alert(
        "Filters",
        "Open Profile → Discovery preferences to adjust gender, age, and distance."
      );
    }
  };

  const meta = MODE_META[mode];

  return (
    <View style={styles.header}>
      <Text style={styles.wordmark}>wanna</Text>
      <View style={styles.headerRight}>
        <Pressable
          onPress={onOpenModePicker}
          hitSlop={6}
          style={[styles.modePill, { backgroundColor: meta.color }]}
        >
          <Icon
            name={meta.iconName}
            size={14}
            color="#FFFFFF"
            weight={mode === "dating" ? "fill" : "bold"}
          />
          <Text style={styles.modePillText}>{meta.label}</Text>
          <Icon
            name="CaretDown"
            size={11}
            color="rgba(255,255,255,0.85)"
            weight="bold"
          />
        </Pressable>
        <Pressable
          style={styles.filterButton}
          onPress={openFilters}
          hitSlop={8}
        >
          <Icon name="FadersHorizontal" size={18} color="#FFFFFF" weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Empty state container (white)
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  // Full-bleed photo container (black so dark scrim blends with chrome)
  bleedContainer: {
    flex: 1,
    backgroundColor: colors.neutral.black,
    position: "relative",
  },
  bleedSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  wordmark: {
    fontFamily: fonts.heading,
    fontSize: 26,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9999,
    backgroundColor: colors.primary.wannaPurple,
    ...shadows.md,
  },
  modePillText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: fonts.heading,
  },
  filterButton: {
    width: 38,
    height: 38,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deckArea: {
    flex: 1,
    position: "relative",
  },
  cardWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  behindCard: {
    transform: [{ scale: 0.96 }],
    opacity: 0.55,
  },
  // Floating action row above the tab bar
  actions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 20,
  },
  smallAction: {
    width: 52,
    height: 52,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.md,
  },
  passButton: {
    backgroundColor: "#FFFFFF",
  },
  likeButtonOuter: {
    borderRadius: 9999,
    ...shadows.brand,
  },
  likeButton: {
    width: 64,
    height: 64,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  undoButton: {
    backgroundColor: "#FFFFFF",
  },
  undoButtonDisabled: {
    backgroundColor: "rgba(255,255,255,0.6)",
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
    marginTop: spacing.md,
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
