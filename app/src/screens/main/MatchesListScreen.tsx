import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { supabase } from "../../lib/supabase";
import { resolveProfilePhotoUrl } from "../../lib/storage";
import { formatRelativeTime } from "../../lib/timeFormat";
import type { ConversationListItem } from "../../types/chat";
import { Icon } from "../../components/Icon";
import { colors, spacing, borderRadius, fontSizes, fonts } from "../../theme";

export function MatchesListScreen({ navigation }: { navigation: any }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationListItem[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("get_conversations_list");
    if (error) {
      console.warn("get_conversations_list error:", error.message);
      return;
    }
    setConversations((data ?? []) as ConversationListItem[]);
  }, [user]);

  useEffect(() => {
    fetchConversations().finally(() => setLoading(false));
  }, [fetchConversations]);

  useFocusEffect(
    useCallback(() => {
      fetchConversations();
    }, [fetchConversations])
  );

  // Subscribe to message changes to live-update last-message preview
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`conversations-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => fetchConversations()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        () => fetchConversations()
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [user, fetchConversations]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Matches</Text>
      </View>
      {conversations.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>💬</Text>
          <Text style={styles.emptyTitle}>No matches yet</Text>
          <Text style={styles.emptySubtitle}>
            Swipe right on activities you wanna do, or post your own. When
            someone matches with you, they'll show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.other_user_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() =>
                navigation.navigate("Chat", {
                  otherUserId: item.other_user_id,
                  otherUserName: item.other_user_name,
                  otherUserPhoto: item.other_user_photo,
                  otherUserVerified: item.other_user_verified,
                })
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ConversationRow({
  conversation,
  onPress,
}: {
  conversation: ConversationListItem;
  onPress: () => void;
}) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    resolveProfilePhotoUrl(conversation.other_user_photo).then(setPhotoUrl);
  }, [conversation.other_user_photo]);

  const lastMessagePreview = conversation.last_message_body
    ? conversation.last_message_from_me
      ? `You: ${conversation.last_message_body}`
      : conversation.last_message_body
    : "Say hi 👋";

  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.avatar}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
        ) : (
          <View style={[styles.avatarImage, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>
              {conversation.other_user_name.charAt(0)}
            </Text>
          </View>
        )}
        {/* Verified badge moved off the photo (was being misread as a
            notification dot) — see name row below. */}
      </View>

      <View style={styles.rowMain}>
        <View style={styles.rowTopLine}>
          <View style={styles.nameRow}>
            <Text
              style={[
                styles.rowName,
                conversation.unread_count > 0 && styles.rowNameUnread,
              ]}
              numberOfLines={1}
            >
              {conversation.other_user_name}
            </Text>
            {conversation.other_user_verified && (
              <Icon
                name="SealCheck"
                size={14}
                color={colors.primary.wannaPurple}
                weight="fill"
              />
            )}
          </View>
          {conversation.last_message_at && (
            <Text style={styles.rowTime}>
              {formatRelativeTime(conversation.last_message_at)}
            </Text>
          )}
        </View>
        <View style={styles.rowBottomLine}>
          <Text
            style={[
              styles.rowPreview,
              conversation.unread_count > 0 && styles.rowPreviewUnread,
            ]}
            numberOfLines={1}
          >
            {lastMessagePreview}
          </Text>
          {conversation.unread_count > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>{conversation.unread_count}</Text>
            </View>
          )}
        </View>
        {conversation.shared_activity_titles.length > 0 && (
          <View style={styles.rowContext}>
            <Icon
              name="Star"
              size={11}
              color={colors.primary.wannaPurple}
              weight="fill"
            />
            <Text style={styles.rowContextText} numberOfLines={1}>
              {conversation.shared_activity_titles.length === 1
                ? conversation.shared_activity_titles[0]
                : `${conversation.shared_activity_titles.length} activities: ${conversation.shared_activity_titles.join(", ")}`}
            </Text>
          </View>
        )}
        {!conversation.has_active_match && (
          <Text style={styles.unmatchedHint}>Unmatched</Text>
        )}
      </View>
    </Pressable>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.cloud,
  },
  headerTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.heading,
    color: colors.neutral.charcoal,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    position: "relative",
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarFallback: {
    backgroundColor: colors.primary.lavenderMist,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontFamily: fonts.heading,
    fontSize: 24,
    color: colors.primary.royalPurple,
  },
  verifiedDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary.wannaPurple,
    borderWidth: 2,
    borderColor: colors.neutral.white,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedCheck: {
    color: colors.neutral.white,
    fontSize: 9,
    fontWeight: "800",
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  nameRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  rowName: {
    fontSize: fontSizes.body,
    fontWeight: "600",
    color: colors.neutral.charcoal,
    flexShrink: 1,
  },
  rowNameUnread: {
    fontWeight: "800",
  },
  rowTime: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
  },
  rowBottomLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowPreview: {
    flex: 1,
    fontSize: fontSizes.body,
    color: colors.neutral.slate,
  },
  rowPreviewUnread: {
    color: colors.neutral.charcoal,
    fontWeight: "600",
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary.wannaPurple,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  unreadCount: {
    color: colors.neutral.white,
    fontSize: 11,
    fontWeight: "700",
  },
  rowContext: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  rowContextText: {
    flex: 1,
    fontSize: fontSizes.caption,
    color: colors.primary.wannaPurple,
    fontWeight: "600",
  },
  unmatchedHint: {
    fontSize: fontSizes.caption,
    color: colors.neutral.slate,
    fontStyle: "italic",
    marginTop: 2,
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
});
