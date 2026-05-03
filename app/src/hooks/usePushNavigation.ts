import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { track } from "../lib/analytics";

/**
 * Listens for push notification taps and navigates to the right screen.
 *
 * Push payloads (set by the send-push edge function in `data`):
 *   - { type: 'interest', activity_id }    → Who's In tab
 *   - { type: 'match', match_id, other_user_id } → Chat with that user
 *   - { type: 'message', match_id, sender_id }   → Chat with sender
 *
 * We also handle the cold-launch case where the app was opened *because*
 * of a notification — getLastNotificationResponseAsync() returns the
 * triggering notification on first mount.
 */
export function usePushNavigation() {
  const navigation = useNavigation<any>();
  const handledNotifIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handle = async (
      response: Notifications.NotificationResponse | null | undefined
    ) => {
      if (!response) return;
      const notifId = response.notification.request.identifier;
      if (handledNotifIds.current.has(notifId)) return;
      handledNotifIds.current.add(notifId);

      const data = response.notification.request.content.data ?? {};
      const type = (data as any).type as string | undefined;

      track("push_tapped", { type });

      if (type === "interest") {
        navigation.navigate("WhosIn", { screen: "WhosInList" });
        return;
      }
      if (type === "new_activities") {
        // Weekly digest — drop the user on Discover.
        navigation.navigate("Discover", { screen: "DiscoverHome" });
        return;
      }
      if (type === "meetup") {
        // The meetup-check modal is global (mounted in RootNavigator
        // via MeetupChecksProvider). We just need to land on the
        // relevant chat; the modal will auto-fire from the pending
        // useMeetupChecks subscription. Falls back to the Matches
        // list if we can't resolve the other user.
        const otherUserId = (data as any).other_user_id;
        if (otherUserId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("id, first_name, photos, is_verified")
            .eq("id", otherUserId)
            .maybeSingle();
          navigation.navigate("Matches", {
            screen: "Chat",
            params: {
              otherUserId,
              otherUserName: profile?.first_name ?? "",
              otherUserPhoto: profile?.photos?.[0] ?? null,
              otherUserVerified: !!profile?.is_verified,
            },
          });
        } else {
          navigation.navigate("Matches", { screen: "MatchesList" });
        }
        return;
      }
      if (type === "match" || type === "message") {
        const otherUserId =
          (data as any).other_user_id ?? (data as any).sender_id;
        if (!otherUserId) return;

        // We need the other user's profile fields to populate the
        // ChatScreen route params. Fetch them quickly.
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, first_name, photos, is_verified")
          .eq("id", otherUserId)
          .maybeSingle();

        navigation.navigate("Matches", {
          screen: "Chat",
          params: {
            otherUserId,
            otherUserName: profile?.first_name ?? "",
            otherUserPhoto: profile?.photos?.[0] ?? null,
            otherUserVerified: !!profile?.is_verified,
          },
        });
      }
    };

    // Cold-launch: app was opened by tapping a notification while killed
    Notifications.getLastNotificationResponseAsync().then(handle);

    // Warm path: app already running, user taps a notification
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [navigation]);
}
