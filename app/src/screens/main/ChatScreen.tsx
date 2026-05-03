import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useAuth } from "../../hooks/useAuth";
import { useNetwork } from "../../hooks/useNetwork";
import { LinkPreview } from "../../components/LinkPreview";
import { sendPush } from "../../lib/push";
import { supabase } from "../../lib/supabase";
import { enqueue, flushQueue, loadQueue } from "../../lib/offlineQueue";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import { formatMessageTime } from "../../lib/timeFormat";
import { track } from "../../lib/analytics";
import { ReportSheet } from "../../components/ReportSheet";
import { ActionMenu, type ActionMenuItem } from "../../components/ActionMenu";
import type { ActiveMatchContext, ChatMessage } from "../../types/chat";
import { Icon } from "../../components/Icon";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

interface RouteParams {
  otherUserId: string;
  otherUserName: string;
  otherUserPhoto: string | null;
  otherUserVerified: boolean;
}

const MAX_MESSAGE_LEN = 2000;
const TYPING_TTL_MS = 3000;
const MESSAGE_QUEUE = "messages";

interface QueuedMessage {
  match_id: string;
  sender_id: string;
  body: string;
  created_at: string; // ISO, used for optimistic ordering
}

export function ChatScreen({ navigation, route }: any) {
  const params = route.params as RouteParams;
  const { user, profile } = useAuth();
  const { online } = useNetwork();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeMatches, setActiveMatches] = useState<ActiveMatchContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const presenceChannel = useRef<RealtimeChannel | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherTypingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingBroadcast = useRef<number>(0);

  const fetchThread = useCallback(async () => {
    if (!user) return;
    const [threadResp, activeResp] = await Promise.all([
      supabase.rpc("get_chat_thread", {
        p_other_user_id: params.otherUserId,
      }),
      supabase.rpc("get_active_matches_with_user", {
        p_other_user_id: params.otherUserId,
      }),
    ]);
    if (threadResp.error) {
      console.warn("get_chat_thread error:", threadResp.error.message);
    } else {
      setMessages((threadResp.data ?? []) as ChatMessage[]);
    }
    if (activeResp.error) {
      console.warn("get_active_matches error:", activeResp.error.message);
    } else {
      setActiveMatches((activeResp.data ?? []) as ActiveMatchContext[]);
    }
  }, [user, params.otherUserId]);

  // Initial load
  useEffect(() => {
    fetchThread().finally(() => setLoading(false));
    resolveProfilePhotoUrl(params.otherUserPhoto).then(setPhotoUrl);

    track("chat_opened", {
      other_user_id: params.otherUserId,
    });

    // Meetup checks now fire only for DATED activities the day after
    // `activity_date` (see migration 00036). The chat-opened trigger for
    // undated matches has been removed — undated/evergreen activities
    // never produce a meetup-check.
  }, [fetchThread, params.otherUserPhoto, params.otherUserId]);

  // Per-message read receipts: when one of *their* messages stays in the
  // viewport ≥300ms, mark it read individually. Falls back to a bulk mark
  // when chat is closed so nothing gets stuck unread.
  const pendingReadTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const readMessageIds = useRef<Set<string>>(new Set());

  const markMessageRead = async (messageId: string) => {
    if (readMessageIds.current.has(messageId)) return;
    readMessageIds.current.add(messageId);
    const startedAt = pendingReadTimers.current.get(messageId);
    pendingReadTimers.current.delete(messageId);
    void startedAt;

    // Privacy: skip the read_at write entirely when the viewer has read
    // receipts disabled. The sender will keep seeing 'Delivered' instead
    // of 'Read'. We still track the read locally (readMessageIds + the
    // analytics event) so the unread badge derived from local state is
    // accurate within this session.
    if (profile && !profile.read_receipts_enabled) {
      track("message_read", {
        match_id: messages.find((m) => m.message_id === messageId)?.match_id,
        message_id: messageId,
        read_receipts_off: true,
      });
      return;
    }

    const { error } = await supabase
      .from("messages")
      .update({
        status: "read",
        read_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      })
      .eq("id", messageId);
    if (error) console.warn("read receipt update error:", error.message);
    else {
      track("message_read", {
        match_id: messages.find((m) => m.message_id === messageId)?.match_id,
        message_id: messageId,
      });
    }
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: any[] }) => {
      if (!user) return;
      // Schedule a read mark after 300ms in the viewport for each
      // unread message from the other user.
      const visibleIds = new Set<string>();
      for (const v of viewableItems) {
        const item: ChatMessage | undefined = v.item;
        if (!item) continue;
        if (item.sender_id === user.id) continue;
        if (item.read_at) continue;
        if (readMessageIds.current.has(item.message_id)) continue;
        visibleIds.add(item.message_id);
        if (!pendingReadTimers.current.has(item.message_id)) {
          const t = setTimeout(() => {
            markMessageRead(item.message_id);
          }, 300);
          pendingReadTimers.current.set(item.message_id, t);
        }
      }
      // Cancel timers for items that scrolled out before the 300ms mark
      for (const [id, timer] of pendingReadTimers.current.entries()) {
        if (!visibleIds.has(id)) {
          clearTimeout(timer);
          pendingReadTimers.current.delete(id);
        }
      }
    }
  ).current;

  // Bulk-mark on unmount as a safety net (covers messages that never made
  // it into the viewport long enough — e.g. user backed out quickly).
  useEffect(() => {
    return () => {
      if (!user) return;
      supabase
        .rpc("mark_thread_read", { p_other_user_id: params.otherUserId })
        .then(({ error }) => {
          if (error) console.warn("mark_thread_read error:", error.message);
        });
      // clear any pending viewport timers
      for (const t of pendingReadTimers.current.values()) clearTimeout(t);
      pendingReadTimers.current.clear();
    };
  }, [user, params.otherUserId]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`chat-${user.id}-${params.otherUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        () => fetchThread()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        () => fetchThread()
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches" },
        () => fetchThread()
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user, params.otherUserId, fetchThread]);

  // Presence channel for typing indicators
  useEffect(() => {
    if (!user) return;
    const ids = [user.id, params.otherUserId].sort();
    const presenceKey = `typing-${ids[0]}-${ids[1]}`;
    const channel = supabase.channel(presenceKey, {
      config: { presence: { key: user.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<
          string,
          { typing?: boolean; ts?: number }[]
        >;
        const otherEntries = state[params.otherUserId];
        const isTyping =
          !!otherEntries &&
          otherEntries.some(
            (e) => e.typing && Date.now() - (e.ts ?? 0) < TYPING_TTL_MS
          );
        setOtherTyping(isTyping);

        if (isTyping) {
          if (otherTypingTimeout.current) {
            clearTimeout(otherTypingTimeout.current);
          }
          otherTypingTimeout.current = setTimeout(() => {
            setOtherTyping(false);
          }, TYPING_TTL_MS);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ typing: false, ts: Date.now() });
        }
      });

    presenceChannel.current = channel;
    return () => {
      channel.unsubscribe();
      presenceChannel.current = null;
    };
  }, [user, params.otherUserId]);

  const broadcastTyping = useCallback(() => {
    if (!presenceChannel.current) return;
    const now = Date.now();
    if (now - lastTypingBroadcast.current < 1500) return;
    lastTypingBroadcast.current = now;
    presenceChannel.current.track({ typing: true, ts: now });
    track("typing_started", { other_user_id: params.otherUserId });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      presenceChannel.current?.track({ typing: false, ts: Date.now() });
    }, TYPING_TTL_MS);
  }, [params.otherUserId]);

  const handleSend = async () => {
    if (!user) return;
    const trimmed = composeText.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_MESSAGE_LEN) {
      Alert.alert("Too long", `Max ${MAX_MESSAGE_LEN} characters`);
      return;
    }
    if (activeMatches.length === 0) {
      Alert.alert(
        "Conversation closed",
        "You don't have an active match with this user anymore."
      );
      return;
    }

    const targetMatch = activeMatches[0];
    const isFirst = !messages.some((m) => m.sender_id === user.id);

    // Optimistic local append
    const optimisticId = `optimistic-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const optimistic: ChatMessage = {
      message_id: optimisticId,
      match_id: targetMatch.match_id,
      activity_id: targetMatch.activity_id,
      activity_title: targetMatch.activity_title,
      sender_id: user.id,
      body: trimmed,
      status: "sent",
      created_at: nowIso,
      delivered_at: null,
      read_at: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setComposeText("");
    presenceChannel.current?.track({ typing: false, ts: Date.now() });
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });

    setSending(true);

    if (!online) {
      await enqueue<QueuedMessage>(MESSAGE_QUEUE, {
        match_id: targetMatch.match_id,
        sender_id: user.id,
        body: trimmed,
        created_at: nowIso,
      });
      track("message_queued_offline", {
        match_id: targetMatch.match_id,
        message_length: trimmed.length,
      });
      setSending(false);
      return;
    }

    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        match_id: targetMatch.match_id,
        sender_id: user.id,
        body: trimmed,
      })
      .select("id")
      .single();
    setSending(false);

    if (error || !inserted) {
      // Roll the optimistic message back and surface the failure
      setMessages((prev) => prev.filter((m) => m.message_id !== optimisticId));
      Alert.alert("Couldn't send", error?.message ?? "Send failed");
      return;
    }

    track("message_sent", {
      match_id: targetMatch.match_id,
      activity_id: targetMatch.activity_id,
      message_length: trimmed.length,
      is_first_message: isFirst,
      has_link: /https?:\/\//.test(trimmed),
    });

    // Fire-and-forget push to the recipient. Edge function skips if the
    // recipient is a seed user or has no registered tokens.
    //
    // TODO(notif-prefs): the recipient's `notify_message_push` flag governs
    // whether they actually want this. We don't gate client-side because the
    // recipient's profile isn't fully loaded here and we don't want to add a
    // round-trip on every send. Server-side gating in the send-push edge
    // function is the follow-up.
    sendPush({
      type: "message",
      message_id: inserted.id,
      match_id: targetMatch.match_id,
      recipient_id: params.otherUserId,
      sender_id: user.id,
      sender_name: profile?.first_name ?? "Someone",
      body_preview: trimmed,
    }).catch(() => {});

    fetchThread();
  };

  // Flush queued messages when we come back online
  useEffect(() => {
    if (!user || !online) return;
    let cancelled = false;
    (async () => {
      const queued = await loadQueue<QueuedMessage>(MESSAGE_QUEUE);
      if (cancelled || queued.length === 0) return;
      const result = await flushQueue<QueuedMessage>(
        MESSAGE_QUEUE,
        async (payload) => {
          const { error } = await supabase.from("messages").insert({
            match_id: payload.match_id,
            sender_id: payload.sender_id,
            body: payload.body,
          });
          if (error) throw error;
        }
      );
      if (result.flushed > 0) {
        track("message_queue_flushed", { flushed: result.flushed });
        fetchThread();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, online, fetchThread]);

  const handleChangeText = (text: string) => {
    setComposeText(text);
    if (text.length > 0) broadcastTyping();
  };

  // Pick the most recent active match (by matched_at) for the "View
  // activity" action when a chat has more than one shared activity.
  const primaryActiveMatch = useMemo<ActiveMatchContext | null>(() => {
    if (activeMatches.length === 0) return null;
    return [...activeMatches].sort((a, b) =>
      (b.matched_at ?? "").localeCompare(a.matched_at ?? "")
    )[0];
  }, [activeMatches]);

  const otherFirstName = useMemo(
    () => params.otherUserName.split(" ")[0] || params.otherUserName,
    [params.otherUserName]
  );

  const handleHeaderMenuAction = (
    action: "viewProfile" | "viewActivity" | "report" | "block" | "unmatch"
  ) => {
    setShowHeaderMenu(false);
    if (action === "viewProfile") {
      navigation.navigate("UserProfile", { userId: params.otherUserId });
      return;
    }
    if (action === "viewActivity") {
      if (!primaryActiveMatch) return;
      navigation.navigate("ActivityDetail", {
        activityId: primaryActiveMatch.activity_id,
      });
      return;
    }
    if (action === "report") {
      setReportVisible(true);
      return;
    }
    if (action === "block") {
      Alert.alert(
        "Block user?",
        `Block ${params.otherUserName}? You'll be unmatched and they'll be hidden everywhere.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Block",
            style: "destructive",
            onPress: async () => {
              if (!user) return;
              await supabase
                .from("blocks")
                .insert({
                  blocker_id: user.id,
                  blocked_user_id: params.otherUserId,
                });
              for (const m of activeMatches) {
                await supabase.rpc("unmatch", { p_match_id: m.match_id });
              }
              navigation.goBack();
            },
          },
        ]
      );
      return;
    }
    if (action === "unmatch") {
      if (activeMatches.length === 0) return;
      Alert.alert(
        "Unmatch?",
        activeMatches.length === 1
          ? `Are you sure you want to unmatch ${params.otherUserName} for ${activeMatches[0].activity_title}? Your chat will close and you will no longer be able to message them.`
          : `Are you sure you want to unmatch ${params.otherUserName} for these ${activeMatches.length} activities? Your chat will close and you will no longer be able to message them.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unmatch",
            style: "destructive",
            onPress: async () => {
              for (const m of activeMatches) {
                await supabase.rpc("unmatch", { p_match_id: m.match_id });
              }
              await fetchThread();
            },
          },
        ]
      );
    }
  };

  const renderItem = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const fromMe = item.sender_id === user?.id;
      const prev = messages[index - 1];
      const showActivityLabel =
        !prev || prev.activity_id !== item.activity_id;
      return (
        <View>
          {showActivityLabel && (
            <View style={styles.activityLabelRow}>
              <Text style={styles.activityLabelText}>
                {item.activity_title}
              </Text>
            </View>
          )}
          <View
            style={[
              styles.bubbleRow,
              fromMe ? styles.bubbleRowMe : styles.bubbleRowThem,
            ]}
          >
            <View
              style={[
                styles.bubble,
                fromMe ? styles.bubbleMe : styles.bubbleThem,
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  fromMe ? styles.bubbleTextMe : styles.bubbleTextThem,
                ]}
              >
                {item.body}
              </Text>
              <LinkPreview
                text={item.body}
                variant="compact"
                onDarkBackground={fromMe}
              />
            </View>
          </View>
          {fromMe && index === messages.length - 1 && (
            <Text style={styles.statusText}>
              {item.status === "read"
                ? "Read"
                : item.status === "delivered"
                  ? "Delivered"
                  : "Sent"}{" "}
              · {formatMessageTime(item.created_at)}
            </Text>
          )}
        </View>
      );
    },
    [messages, user?.id]
  );

  const conversationReadOnly = activeMatches.length === 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary.wannaPurple} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        {/* Tapping the avatar OR name opens the user's profile (F3).
            The dots menu on the right keeps the unmatch/report/block
            actions accessible. */}
        <Pressable
          onPress={() =>
            navigation.navigate("UserProfile", {
              userId: params.otherUserId,
            })
          }
          style={styles.headerCenter}
        >
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
              <Text style={styles.headerAvatarInitial}>
                {params.otherUserName.charAt(0)}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={styles.headerNameRow}>
              <Text style={styles.headerName} numberOfLines={1}>
                {params.otherUserName}
              </Text>
              {/* Verified seal moved next to the name (F2 — was an
                  ambiguous dot on the photo). */}
              {params.otherUserVerified && (
                <Icon
                  name="SealCheck"
                  size={15}
                  color={colors.primary.wannaPurple}
                  weight="fill"
                />
              )}
            </View>
            {activeMatches.length > 0 ? (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {activeMatches.length === 1
                  ? activeMatches[0].activity_title
                  : `${activeMatches.length} active matches`}
              </Text>
            ) : (
              <Text style={styles.headerSubtitleMuted}>Unmatched</Text>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={() => setShowHeaderMenu((s) => !s)}
          style={styles.menuBtn}
        >
          <Text style={styles.menuIcon}>⋯</Text>
        </Pressable>
      </View>

      <ActionMenu
        visible={showHeaderMenu}
        title={otherFirstName}
        onClose={() => setShowHeaderMenu(false)}
        items={(() => {
          const items: ActionMenuItem[] = [
            {
              label: `View ${otherFirstName}'s profile`,
              onPress: () => handleHeaderMenuAction("viewProfile"),
            },
          ];
          if (primaryActiveMatch) {
            items.push({
              label: "View activity",
              onPress: () => handleHeaderMenuAction("viewActivity"),
            });
          }
          if (!conversationReadOnly) {
            items.push({
              label: "Unmatch",
              onPress: () => handleHeaderMenuAction("unmatch"),
              destructive: true,
            });
          }
          items.push({
            label: "Report",
            destructive: true,
            onPress: () => handleHeaderMenuAction("report"),
          });
          items.push({
            label: "Block",
            onPress: () => handleHeaderMenuAction("block"),
            destructive: true,
          });
          return items;
        })()}
      />

      {conversationReadOnly && (
        <View style={styles.unmatchedBanner}>
          <Text style={styles.unmatchedBannerText}>
            This conversation is read-only — you're no longer matched.
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.message_id}
          contentContainerStyle={styles.messagesList}
          renderItem={renderItem}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{
            itemVisiblePercentThreshold: 60,
            minimumViewTime: 0,
          }}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListEmptyComponent={
            <View style={styles.emptyThread}>
              <Text style={styles.emptyThreadText}>
                Start the conversation 👋
              </Text>
            </View>
          }
          ListFooterComponent={
            otherTyping ? (
              <View style={styles.bubbleRowThem}>
                <View style={[styles.bubble, styles.bubbleThem, styles.typingBubble]}>
                  <View style={styles.typingDots}>
                    <Text style={styles.typingDot}>•</Text>
                    <Text style={styles.typingDot}>•</Text>
                    <Text style={styles.typingDot}>•</Text>
                  </View>
                </View>
              </View>
            ) : null
          }
        />

        {/* Compose */}
        <View style={styles.composer}>
          <TextInput
            value={composeText}
            onChangeText={handleChangeText}
            placeholder={
              conversationReadOnly
                ? "Conversation is read-only"
                : "Type a message…"
            }
            placeholderTextColor={colors.neutral.slate}
            style={styles.composeInput}
            multiline
            maxLength={MAX_MESSAGE_LEN}
            editable={!conversationReadOnly}
          />
          <Pressable
            onPress={handleSend}
            disabled={
              sending || !composeText.trim() || conversationReadOnly
            }
            style={[
              styles.sendBtn,
              (sending || !composeText.trim() || conversationReadOnly) &&
                styles.sendBtnDisabled,
            ]}
          >
            <Text style={styles.sendIcon}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ReportSheet
        visible={reportVisible}
        reportedUserId={params.otherUserId}
        reportedUserName={params.otherUserName}
        reportedContentType="profile"
        source="chat"
        onClose={() => setReportVisible(false)}
        onAfterSubmit={() => navigation.goBack()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.neutral.white,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
    gap: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: {
    fontSize: 28,
    color: colors.primary.wannaPurple,
    fontWeight: "300",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  headerAvatarFallback: {
    backgroundColor: colors.primary.lavenderMist,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarInitial: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.primary.royalPurple,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerName: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.subhead,
    color: colors.neutral.charcoal,
  },
  verifiedDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedCheck: {
    color: colors.neutral.white,
    fontSize: 9,
    fontWeight: "800",
  },
  headerSubtitle: {
    fontSize: fontSizes.caption,
    color: colors.primary.wannaPurple,
  },
  headerSubtitleMuted: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    fontStyle: "italic",
  },
  menuBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: {
    fontSize: 24,
    color: colors.neutral.charcoal,
    fontWeight: "700",
  },
  menuPopover: {
    position: "absolute",
    top: 60,
    right: spacing.md,
    backgroundColor: colors.neutral.white,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    minWidth: 160,
    zIndex: 10,
    shadowColor: colors.neutral.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 6,
  },
  menuItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  menuItemText: {
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  menuItemDestructive: {
    color: "#E53E3E",
  },
  unmatchedBanner: {
    backgroundColor: colors.neutral.cloud,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  unmatchedBannerText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    fontStyle: "italic",
  },
  messagesList: {
    flexGrow: 1,
    padding: spacing.md,
  },
  emptyThread: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyThreadText: {
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
  },
  activityLabelRow: {
    alignItems: "center",
    marginVertical: spacing.sm,
  },
  activityLabelText: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    backgroundColor: colors.neutral.cloud,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  bubbleRow: {
    marginVertical: 2,
  },
  bubbleRowMe: {
    alignItems: "flex-end",
  },
  bubbleRowThem: {
    alignItems: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 20,
  },
  bubbleMe: {
    backgroundColor: colors.primary.wannaPurple,
    borderBottomRightRadius: 4,
  },
  bubbleThem: {
    backgroundColor: colors.neutral.cloud,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: fontSizes.body,
    lineHeight: 22,
  },
  bubbleTextMe: {
    color: colors.neutral.white,
  },
  bubbleTextThem: {
    color: colors.neutral.charcoal,
  },
  typingBubble: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  typingDots: {
    flexDirection: "row",
    gap: 2,
  },
  typingDot: {
    color: colors.neutral.slate,
    fontSize: 24,
    lineHeight: 24,
  },
  statusText: {
    alignSelf: "flex-end",
    fontSize: fontSizes.caption - 1,
    color: colors.neutral.slate,
    marginTop: 2,
    marginRight: spacing.xs,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.neutral.cloud,
    gap: spacing.sm,
  },
  composeInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: colors.neutral.cloud,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSizes.body,
    color: colors.neutral.charcoal,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary.wannaPurple,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    backgroundColor: colors.neutral.slate,
    opacity: 0.5,
  },
  sendIcon: {
    color: colors.neutral.white,
    fontSize: 22,
    fontWeight: "700",
  },
});
