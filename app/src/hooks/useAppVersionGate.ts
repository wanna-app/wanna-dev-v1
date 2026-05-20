import { useEffect, useState } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { supabase } from "../lib/supabase";

// Compare two semver-ish strings ("1.2.3" vs "1.3.0"). Returns true if
// `running` is below `min`. Only major.minor.patch are considered;
// pre-release / build suffixes are ignored.
function isBelow(running: string, min: string): boolean {
  const r = running.split(".").map((n) => parseInt(n, 10) || 0);
  const m = min.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const rv = r[i] ?? 0;
    const mv = m[i] ?? 0;
    if (rv < mv) return true;
    if (rv > mv) return false;
  }
  return false;
}

export type AppVersionGateState =
  | { status: "loading" }
  | { status: "ok" }
  | { status: "outdated"; storeUrl: string; minVersion: string; runningVersion: string };

/**
 * Reads `app_config` (singleton) on cold boot and compares the bundled
 * app version to `min_supported_version`. If we're below, returns an
 * outdated state with the store URL to send the user to.
 *
 * Designed to fail open — if the network call errors or the config row
 * is missing, we return "ok" so a Supabase outage doesn't lock users
 * out of their own app.
 */
export function useAppVersionGate(): AppVersionGateState {
  const [state, setState] = useState<AppVersionGateState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("app_config")
          .select("min_supported_version, store_url_ios, store_url_android")
          .eq("id", 1)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setState({ status: "ok" });
          return;
        }
        const runningVersion = String(
          Constants.expoConfig?.version ?? "0.0.0"
        );
        const minVersion = String(data.min_supported_version);
        if (isBelow(runningVersion, minVersion)) {
          const storeUrl =
            Platform.OS === "ios" ? data.store_url_ios : data.store_url_android;
          setState({ status: "outdated", storeUrl, minVersion, runningVersion });
        } else {
          setState({ status: "ok" });
        }
      } catch {
        // Fail open — don't lock users out on transient network errors.
        if (!cancelled) setState({ status: "ok" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
