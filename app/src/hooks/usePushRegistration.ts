import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

// How notifications behave when received with the app foregrounded.
// We swallow the banner for the chat the user is currently looking at;
// for everything else we let the OS show the alert + sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Registers the device's Expo Push Token against the signed-in user.
 * Idempotent: it does an upsert keyed on the token. Safe to call repeatedly.
 *
 * Skips entirely on simulators (Apple Push Notifications don't work in iOS
 * Simulator) and for users with no profile yet.
 */
export function usePushRegistration() {
  const { user, profile } = useAuth();
  const registeredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      registeredTokenRef.current = null;
      return;
    }
    if (!profile) return; // wait until profile is loaded so we know is_seed
    register().catch((e) => {
      console.warn("usePushRegistration error:", e);
    });

    async function register() {
      if (!Device.isDevice) {
        // Simulators can't receive APNs / FCM messages; skip silently.
        return;
      }

      // Permission must already be granted before we call this. The
      // request itself is gated by PushPrePromptModal — we explain WHY
      // notifications matter BEFORE showing iOS's system dialog, which
      // dramatically improves opt-in rates over auto-prompting.
      // If permission hasn't been granted yet, just skip — the
      // pre-prompt will fire when the user reaches the home tab and
      // call our registration once granted.
      const existing = await Notifications.getPermissionsAsync();
      if (!existing.granted) return;

      // Android needs a notification channel before we can show alerts.
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.HIGH,
          sound: "default",
        });
      }

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ??
        (Constants as any).easConfig?.projectId;

      // Without an EAS project id we can't get a real Expo push token,
      // but we don't want to crash dev builds.
      const tokenResp = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      const token = tokenResp.data;
      if (!token) return;
      if (registeredTokenRef.current === token) return;

      const { error } = await supabase.from("device_tokens").upsert(
        {
          user_id: user!.id,
          expo_push_token: token,
          platform: Platform.OS as "ios" | "android" | "web",
          device_name:
            Device.deviceName ??
            (`${Device.brand ?? ""} ${Device.modelName ?? ""}`.trim() ||
              null),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "expo_push_token" }
      );
      if (error) {
        console.warn("device_tokens upsert error:", error.message);
        return;
      }
      registeredTokenRef.current = token;
    }
  }, [user, profile]);
}

/**
 * Unregisters the device on sign-out so a stale token doesn't keep
 * receiving pushes intended for the next user on this device.
 */
export async function unregisterDeviceToken(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResp.data;
    if (!token) return;
    await supabase.from("device_tokens").delete().eq("expo_push_token", token);
  } catch (e) {
    // best-effort
  }
}
